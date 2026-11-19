// ===========================================================================
//   servidor.js  -  O SERVIDOR DA HMDF esportes
//
//   A tela (navegador) pede, o servidor conversa com o banco (SQL) e
//   responde em JSON.
//
//   Cada tabela tem 4 pedidos:
//
//      GET     /api/alunos       listar
//      POST    /api/alunos       cadastrar
//      PUT     /api/alunos/3     alterar
//      DELETE  /api/alunos/3     excluir
//
//   Valem para:  alunos, treinadores, modalidades, matriculas
//   E o login do treinador:  POST /api/login/treinador
//   E o Portal (aluno ou treinador):
//        GET /api/portal/CPF-ou-ID          (aluno)
//        GET /api/portal/treinador/ID       (treinador, com a lista dos alunos dele)
//
//   Cancelar uma matrícula (DELETE /api/matriculas/3) NÃO apaga o aluno:
//   ele fica marcado como "não matriculado" (aluno.matriculado = 0). Some da
//   lista de alunos, do portal e da lista do treinador, e continua aparecendo
//   só na tabela de matrículas, com o status "Não matriculado".
//   Para voltar:  POST /api/matriculas/3/reativar
//
//   O ID (1, 2, 3...) é criado pelo banco. O servidor só pega o número e
//   devolve na resposta em JSON.
//
//   Toda vez que algo muda, o servidor também atualiza o arquivo dados.json
//   com uma cópia de tudo que está no banco.
// ===========================================================================

const http = require('http');
const fs = require('fs');
const path = require('path');

const { executar, listar, buscarUm, pronto } = require('./banco');
const seguranca = require('./seguranca');

const PORTA = 3000;


// ---------------------------------------------------------------------------
//   FERRAMENTAS
// ---------------------------------------------------------------------------

// Responde com JSON
function enviar(resposta, codigo, dados) {
  resposta.writeHead(codigo, { 'Content-Type': 'application/json; charset=utf-8' });
  resposta.end(JSON.stringify(dados));
}

// Lê o JSON que a tela enviou
function lerCorpo(pedido) {
  return new Promise((certo) => {
    let texto = '';
    pedido.on('data', (pedaco) => { texto += pedaco; });
    pedido.on('end', () => {
      try { certo(JSON.parse(texto)); }
      catch (e) { certo({}); }
    });
  });
}

// Confere se os campos obrigatórios chegaram preenchidos.
// Exemplo:  exigir(dados, { nome: 'o nome', cpf: 'o CPF' })
function exigir(dados, campos) {
  for (const campo in campos) {
    if (!String(dados[campo] || '').trim()) {
      throw new Error('Preencha ' + campos[campo] + '.');
    }
  }
}

// O banco responde em inglês. Aqui trocamos pelas frases em português.
function traduzirErro(mensagem) {
  if (mensagem.includes('aluno.cpf'))              return 'Já existe um aluno com esse CPF (ele pode estar com a matrícula cancelada: veja a aba Matrículas).';
  if (mensagem.includes('treinador.cdedf'))        return 'Já existe um treinador com esse CREF.';
  if (mensagem.includes('treinador.login'))        return 'Já existe um treinador com esse e-mail.';
  if (mensagem.includes('alunomodalidade'))        return 'Esse aluno já está nessa modalidade.';
  if (mensagem.includes('UNIQUE'))                 return 'Esse registro já existe.';
  if (mensagem.includes('FOREIGN KEY'))            return 'Não dá para excluir: este registro está sendo usado em outra tabela.';
  return mensagem;
}

// Roda o que a rota pediu. Se der erro, responde com a frase do erro.
async function tentar(resposta, trabalho) {
  try {
    const resultado = await trabalho();
    enviar(resposta, 200, resultado);
  } catch (erro) {
    enviar(resposta, 400, { erro: traduzirErro(erro.message) });
  }
}

// Se UPDATE ou DELETE não mudou nenhuma linha, esse id não existe.
function conferirMudou(resultado) {
  if (resultado.mudou === 0) throw new Error('Esse registro não existe.');
}


// Lê o treinador escolhido para o aluno. Devolve o número, ou null se não escolheu ninguém.
async function lerTreinadorId(d) {
  const texto = String(d.treinador_id === undefined || d.treinador_id === null ? '' : d.treinador_id).trim();
  if (!texto) return null;

  const existe = await buscarUm('SELECT id FROM treinador WHERE id = ?', [texto]);
  if (!existe) throw new Error('Esse treinador não existe.');
  return existe.id;
}

// Apaga o aluno de TODAS as tabelas: primeiro as matrículas dele, depois o cadastro.
async function apagarAluno(alunoId) {
  const aluno = await buscarUm('SELECT id FROM aluno WHERE id = ?', [alunoId]);
  if (!aluno) throw new Error('Esse registro não existe.');

  await executar('DELETE FROM alunomodalidade WHERE aluno_id = ?', [aluno.id]);
  await executar('DELETE FROM aluno WHERE id = ?', [aluno.id]);
}

// Cancelar matrícula: o aluno sai de todas as telas, menos da tabela de matrículas.
async function cancelarMatriculaDoAluno(alunoId) {
  const r = await executar('UPDATE aluno SET matriculado = 0 WHERE id = ?', [alunoId]);
  conferirMudou(r);
}

// Dados do treinador + os alunos que escolheram ele (usado no Portal).
async function dadosDoTreinador(treinadorId) {
  const treinador = await buscarUm(
    'SELECT id, cdedf, nome, login, especialidade, telefone FROM treinador WHERE id = ?',
    [treinadorId]
  );
  if (!treinador) throw new Error('Treinador não encontrado.');

  const alunos = await listar(`
    SELECT aluno.id, aluno.nome, aluno.cpf, aluno.telefone,
           (SELECT group_concat(modalidade_esporte || ' (' || modalidade_turno || ')', ', ')
              FROM alunomodalidade WHERE aluno_id = aluno.id) AS modalidades
      FROM aluno
     WHERE aluno.treinador_id = ? AND aluno.matriculado = 1
     ORDER BY aluno.nome
  `, [treinador.id]);

  return { treinador, alunos };
}


// ---------------------------------------------------------------------------
//   O ARQUIVO dados.json
//   Uma cópia de tudo que está no banco. Atualizada a cada mudança.
//   (A senha do treinador nunca vai para o arquivo.)
// ---------------------------------------------------------------------------

async function salvarJson() {
  const copia = {
    alunos:      await listar('SELECT * FROM aluno'),
    treinadores: await listar('SELECT id, cdedf, nome, login, especialidade, telefone FROM treinador'),
    modalidades: await listar('SELECT * FROM modalidade'),
    matriculas:  await listar('SELECT * FROM alunomodalidade')
  };
  fs.writeFileSync(path.join(__dirname, 'dados.json'), JSON.stringify(copia, null, 2));
}


// ---------------------------------------------------------------------------
//   O SERVIDOR
// ---------------------------------------------------------------------------

const servidor = http.createServer(async (pedido, resposta) => {

  // '/api/alunos/3'  ->  ['', 'api', 'alunos', '3']
  const partes = pedido.url.split('?')[0].split('/');
  const recurso = partes[2];
  const id = partes[3];
  const metodo = pedido.method;


  // ======================= ARQUIVOS DA TELA =======================
  // Só estes 3 arquivos e as imagens da pasta imagens/ podem ser entregues ao
  // navegador (assim o banco.db, o dados.json e o código do servidor nunca ficam expostos).
  // Procuramos primeiro na pasta public/ e, se ela não existir, na pasta do servidor.js.
  if (partes[1] !== 'api') {

    const endereco = pedido.url.split('?')[0] === '/' ? '/index.html' : decodeURIComponent(pedido.url.split('?')[0]);
    const permitidos = ['/index.html', '/style.css', '/script.js'];
    const ehImagem = /^\/imagens\/[\w.-]+\.(png|jpe?g|webp|svg)$/i.test(endereco);

    let arquivo = null;
    if (metodo === 'GET' && (permitidos.includes(endereco) || ehImagem)) {
      const candidatos = [
        path.join(__dirname, 'public', endereco),
        path.join(__dirname, endereco)
      ];
      arquivo = candidatos.find((c) => fs.existsSync(c) && fs.statSync(c).isFile()) || null;
    }

    if (!arquivo) {
      resposta.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      resposta.end('Não achei o arquivo ' + endereco);
      return;
    }

    const tipos = {
      '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'application/javascript; charset=utf-8',
      '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml'
    };
    resposta.writeHead(200, { 'Content-Type': tipos[path.extname(arquivo).toLowerCase()] || 'text/plain; charset=utf-8' });
    resposta.end(fs.readFileSync(arquivo));
    return;
  }


  // ============================== ALUNOS ==================================

  if (recurso === 'alunos' && metodo === 'GET') {
    return tentar(resposta, () => listar(`
      SELECT aluno.*, treinador.nome AS treinador_nome
        FROM aluno
        LEFT JOIN treinador ON aluno.treinador_id = treinador.id
       WHERE aluno.matriculado = 1
       ORDER BY aluno.nome
    `));
  }

  if (recurso === 'alunos' && metodo === 'POST') {
    return tentar(resposta, async () => {
      const d = await lerCorpo(pedido);
      exigir(d, { nome: 'o nome', cpf: 'o CPF', login: 'o e-mail', cidade: 'a cidade', telefone: 'o telefone', cep: 'o CEP' });

      const treinadorId = await lerTreinadorId(d);

      // Repare: não mandamos o id. O banco cria sozinho.
      const r = await executar(
        'INSERT INTO aluno (nome, cpf, login, cidade, telefone, cep, treinador_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [d.nome.trim(), d.cpf, d.login.trim(), d.cidade.trim(), d.telefone, d.cep, treinadorId]
      );
      await salvarJson();
      return { id: r.id };   // este é o ID de matrícula do aluno
    });
  }

  if (recurso === 'alunos' && metodo === 'PUT' && id) {
    return tentar(resposta, async () => {
      const d = await lerCorpo(pedido);
      exigir(d, { nome: 'o nome', cpf: 'o CPF', login: 'o e-mail', cidade: 'a cidade', telefone: 'o telefone', cep: 'o CEP' });

      const treinadorId = await lerTreinadorId(d);

      const r = await executar(
        'UPDATE aluno SET nome = ?, cpf = ?, login = ?, cidade = ?, telefone = ?, cep = ?, treinador_id = ? WHERE id = ?',
        [d.nome.trim(), d.cpf, d.login.trim(), d.cidade.trim(), d.telefone, d.cep, treinadorId, id]
      );
      conferirMudou(r);
      await salvarJson();
      return { id: Number(id) };
    });
  }

  if (recurso === 'alunos' && metodo === 'DELETE' && id) {
    return tentar(resposta, async () => {
      await apagarAluno(id);   // apaga também as matrículas dele
      await salvarJson();
      return { id: Number(id) };
    });
  }


  // ============================ TREINADORES ===============================

  if (recurso === 'treinadores' && metodo === 'GET') {
    // A senha não sai do servidor.
    return tentar(resposta, () => listar(
      'SELECT id, cdedf, nome, login, especialidade, telefone FROM treinador ORDER BY nome'
    ));
  }

  if (recurso === 'treinadores' && metodo === 'POST') {
    return tentar(resposta, async () => {
      const d = await lerCorpo(pedido);
      exigir(d, { nome: 'o nome', cdedf: 'o CREF', login: 'o e-mail', especialidade: 'a modalidade principal', telefone: 'o telefone', senha: 'a senha' });
      if (d.senha.length < 6) throw new Error('A senha precisa ter pelo menos 6 caracteres.');

      const r = await executar(
        'INSERT INTO treinador (cdedf, nome, login, especialidade, telefone, senha) VALUES (?, ?, ?, ?, ?, ?)',
        [d.cdedf.trim(), d.nome.trim(), d.login.trim().toLowerCase(), d.especialidade.trim(), d.telefone, seguranca.gerarHash(d.senha)]
      );
      await salvarJson();
      return { id: r.id };
    });
  }

  if (recurso === 'treinadores' && metodo === 'PUT' && id) {
    return tentar(resposta, async () => {
      const d = await lerCorpo(pedido);
      exigir(d, { nome: 'o nome', cdedf: 'o CREF', login: 'o e-mail', especialidade: 'a modalidade principal', telefone: 'o telefone' });

      let r;
      if (d.senha) {
        // Se veio senha nova, troca. Se veio vazia, mantém a antiga.
        if (d.senha.length < 6) throw new Error('A senha precisa ter pelo menos 6 caracteres.');
        r = await executar(
          'UPDATE treinador SET cdedf = ?, nome = ?, login = ?, especialidade = ?, telefone = ?, senha = ? WHERE id = ?',
          [d.cdedf.trim(), d.nome.trim(), d.login.trim().toLowerCase(), d.especialidade.trim(), d.telefone, seguranca.gerarHash(d.senha), id]
        );
      } else {
        r = await executar(
          'UPDATE treinador SET cdedf = ?, nome = ?, login = ?, especialidade = ?, telefone = ? WHERE id = ?',
          [d.cdedf.trim(), d.nome.trim(), d.login.trim().toLowerCase(), d.especialidade.trim(), d.telefone, id]
        );
      }
      conferirMudou(r);
      await salvarJson();
      return { id: Number(id) };
    });
  }

  if (recurso === 'treinadores' && metodo === 'DELETE' && id) {
    return tentar(resposta, async () => {
      // Os alunos desse treinador ficam sem treinador (continuam cadastrados).
      await executar('UPDATE aluno SET treinador_id = NULL WHERE treinador_id = ?', [id]);
      const r = await executar('DELETE FROM treinador WHERE id = ?', [id]);
      conferirMudou(r);
      await salvarJson();
      return { id: Number(id) };
    });
  }


  // ============================ MODALIDADES ===============================

  if (recurso === 'modalidades' && metodo === 'GET') {
    return tentar(resposta, () => listar('SELECT * FROM modalidade ORDER BY esporte, agenda'));
  }

  if (recurso === 'modalidades' && metodo === 'POST') {
    return tentar(resposta, async () => {
      const d = await lerCorpo(pedido);
      exigir(d, { esporte: 'o esporte', turno: 'o turno', turma: 'a turma', agenda: 'o dia da semana' });

      const r = await executar(
        'INSERT INTO modalidade (esporte, turno, turma, agenda) VALUES (?, ?, ?, ?)',
        [d.esporte.trim(), d.turno, d.turma.trim(), d.agenda]
      );
      await salvarJson();
      return { id: r.id };
    });
  }

  if (recurso === 'modalidades' && metodo === 'PUT' && id) {
    return tentar(resposta, async () => {
      const d = await lerCorpo(pedido);
      exigir(d, { esporte: 'o esporte', turno: 'o turno', turma: 'a turma', agenda: 'o dia da semana' });

      const r = await executar(
        'UPDATE modalidade SET esporte = ?, turno = ?, turma = ?, agenda = ? WHERE id = ?',
        [d.esporte.trim(), d.turno, d.turma.trim(), d.agenda, id]
      );
      conferirMudou(r);

      // As matrículas guardam uma cópia do esporte e do turno. Atualizamos junto.
      await executar(
        'UPDATE alunomodalidade SET modalidade_esporte = ?, modalidade_turno = ? WHERE modalidade_id = ?',
        [d.esporte.trim(), d.turno, id]
      );
      await salvarJson();
      return { id: Number(id) };
    });
  }

  if (recurso === 'modalidades' && metodo === 'DELETE' && id) {
    return tentar(resposta, async () => {
      // Se tiver aluno matriculado, a FOREIGN KEY do banco recusa aqui.
      const r = await executar('DELETE FROM modalidade WHERE id = ?', [id]);
      conferirMudou(r);
      await salvarJson();
      return { id: Number(id) };
    });
  }


  // ========================== PORTAL DO ALUNO =============================
  // Busca UM aluno pelo CPF (com ou sem pontos e traço) ou pelo ID de matrícula
  // e devolve todos os dados dele + as modalidades em que está matriculado.

  // Portal do treinador:  GET /api/portal/treinador/ID
  if (recurso === 'portal' && id === 'treinador' && metodo === 'GET') {
    return tentar(resposta, () => dadosDoTreinador(partes[4]));
  }

  if (recurso === 'portal' && metodo === 'GET') {
    return tentar(resposta, async () => {
      let busca = '';
      try { busca = decodeURIComponent(id || ''); } catch (e) { busca = ''; }

      // Só os números: "123.456.789-09" vira "12345678909"
      const numeros = busca.replace(/\D/g, '');
      if (!numeros) throw new Error('Digite o CPF ou o ID de matrícula do aluno.');

      let aluno;
      if (numeros.length === 11) {
        // 11 números = CPF. Comparamos sem pontos e sem traço.
        aluno = await buscarUm(
          "SELECT * FROM aluno WHERE matriculado = 1 AND replace(replace(replace(cpf, '.', ''), '-', ''), ' ', '') = ?",
          [numeros]
        );
      } else if (numeros.length <= 9) {
        // Número curto = ID de matrícula.
        aluno = await buscarUm('SELECT * FROM aluno WHERE id = ? AND matriculado = 1', [Number(numeros)]);
      }

      if (!aluno) throw new Error('Aluno não encontrado. Confira o CPF ou o ID de matrícula.');

      const modalidades = await listar(`
        SELECT modalidade.esporte, modalidade.turno, modalidade.turma, modalidade.agenda
          FROM alunomodalidade
          INNER JOIN modalidade ON alunomodalidade.modalidade_id = modalidade.id
         WHERE alunomodalidade.aluno_id = ?
         ORDER BY modalidade.esporte, modalidade.agenda
      `, [aluno.id]);

      // O treinador escolhido para o aluno (ou null se não tem).
      const treinador = aluno.treinador_id
        ? await buscarUm('SELECT nome, cdedf, especialidade FROM treinador WHERE id = ?', [aluno.treinador_id])
        : null;

      return { aluno, modalidades, treinador };
    });
  }


  // ============================ MATRICULAS ================================
  // (a tabela alunomodalidade: liga o aluno à modalidade)

  if (recurso === 'matriculas' && metodo === 'GET') {
    // INNER JOIN: junta a matrícula com o aluno para mostrar o NOME e o CPF
    return tentar(resposta, () => listar(`
      SELECT alunomodalidade.id,
             alunomodalidade.modalidade_esporte AS esporte,
             alunomodalidade.modalidade_turno   AS turno,
             aluno.nome AS aluno,
             aluno.cpf  AS cpf,
             aluno.matriculado AS matriculado
        FROM alunomodalidade
        INNER JOIN aluno ON alunomodalidade.aluno_id = aluno.id
       ORDER BY alunomodalidade.modalidade_esporte, aluno.nome
    `));
  }

  // Reativar: o aluno volta a ficar "Matriculado" e reaparece em todas as telas.
  if (recurso === 'matriculas' && metodo === 'POST' && id && partes[4] === 'reativar') {
    return tentar(resposta, async () => {
      const matricula = await buscarUm('SELECT aluno_id FROM alunomodalidade WHERE id = ?', [id]);
      if (!matricula) throw new Error('Esse registro não existe.');

      await executar('UPDATE aluno SET matriculado = 1 WHERE id = ?', [matricula.aluno_id]);
      await salvarJson();
      return { id: Number(id), aluno_id: matricula.aluno_id };
    });
  }

  if (recurso === 'matriculas' && metodo === 'POST') {
    return tentar(resposta, async () => {
      const d = await lerCorpo(pedido);
      exigir(d, { aluno_id: 'o atleta', modalidade_id: 'a modalidade' });

      // Aluno com matrícula cancelada não pode entrar em modalidade nova.
      const aluno = await buscarUm('SELECT matriculado FROM aluno WHERE id = ?', [d.aluno_id]);
      if (!aluno) throw new Error('Esse atleta não existe.');
      if (!aluno.matriculado) throw new Error('Esse atleta está com a matrícula cancelada. Reative a matrícula antes.');

      // Buscamos a modalidade para copiar o esporte e o turno dela.
      const modalidade = await buscarUm('SELECT esporte, turno FROM modalidade WHERE id = ?', [d.modalidade_id]);
      if (!modalidade) throw new Error('Essa modalidade não existe.');

      const r = await executar(
        'INSERT INTO alunomodalidade (aluno_id, modalidade_id, modalidade_turno, modalidade_esporte) VALUES (?, ?, ?, ?)',
        [d.aluno_id, d.modalidade_id, modalidade.turno, modalidade.esporte]
      );
      await salvarJson();
      return { id: r.id };
    });
  }

  // Cancelar a matrícula: o aluno vira "Não matriculado". Some de todas as
  // tabelas, menos da de matrículas (nada é apagado do banco).
  if (recurso === 'matriculas' && metodo === 'DELETE' && id) {
    return tentar(resposta, async () => {
      const matricula = await buscarUm('SELECT aluno_id FROM alunomodalidade WHERE id = ?', [id]);
      if (!matricula) throw new Error('Esse registro não existe.');

      await cancelarMatriculaDoAluno(matricula.aluno_id);
      await salvarJson();
      return { id: Number(id), aluno_id: matricula.aluno_id };
    });
  }


  // =============================== LOGIN ==================================

  // O treinador entra com o e-mail e a senha.
  if (recurso === 'login' && id === 'treinador' && metodo === 'POST') {
    return tentar(resposta, async () => {
      const d = await lerCorpo(pedido);
      const treinador = await buscarUm(
        'SELECT id, nome, senha FROM treinador WHERE login = ?',
        [String(d.email || '').trim().toLowerCase()]
      );

      if (!treinador || !seguranca.conferirSenha(String(d.senha || ''), treinador.senha)) {
        throw new Error('E-mail ou senha incorretos.');
      }
      const portal = await dadosDoTreinador(treinador.id);
      return { id: treinador.id, nome: treinador.nome, treinador: portal.treinador, alunos: portal.alunos };
    });
  }


  // Nenhuma rota reconheceu o pedido
  enviar(resposta, 404, { erro: 'Não conheço ' + metodo + ' ' + pedido.url });
});


// Só liga o servidor depois que o banco estiver pronto.
pronto.then(async () => {
  await salvarJson();
  servidor.listen(PORTA, () => {
    console.log('');
    console.log('  HMDF esportes no ar:  http://localhost:' + PORTA);
    console.log('  Para parar: Ctrl + C');
    console.log('');
  });
}).catch((erro) => {
  console.log('Erro ao preparar o banco:', erro.message);
});

servidor.on('error', (erro) => {
  if (erro.code === 'EADDRINUSE') {
    console.log('  A porta ' + PORTA + ' já está em uso. Feche o outro terminal que está com o servidor aberto.');
  } else {
    throw erro;
  }
});
