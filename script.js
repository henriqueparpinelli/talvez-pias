// ===========================================================================
//   script.js  -  A PARTE DO NAVEGADOR
//
//   Este arquivo não enxerga o banco de dados. Ele só PEDE ao servidor
//   (com fetch) e desenha a resposta na tela.
//
//   Partes:
//     1. máscaras (CPF, telefone, CEP)
//     2. ferramentas (pedir, avisar, montar tabela)
//     3. uma seção para cada aba
//     4. começo
// ===========================================================================


// ===========================================================================
//   1. MÁSCARAS
// ===========================================================================

function aplicarMascaraCPF(input) {
    let valor = input.value.replace(/\D/g, "");
    valor = valor.replace(/(\d{3})(\d)/, "$1.$2");
    valor = valor.replace(/(\d{3})(\d)/, "$1.$2");
    valor = valor.replace(/(\d{3})(\d{1,2})$/, "$1-$2");
    input.value = valor;
}

function aplicarMascaraTelefone(input) {
    let valor = input.value.replace(/\D/g, "");
    valor = valor.replace(/^(\d{2})(\d)/g, "($1) $2");
    valor = valor.replace(/(\d{4,5})(\d{4})$/, "$1-$2");
    input.value = valor;
}

function aplicarMascaraCEP(input) {
    let valor = input.value.replace(/\D/g, "");
    valor = valor.replace(/^(\d{5})(\d)/, "$1-$2");
    input.value = valor;
}


// ===========================================================================
//   2. FERRAMENTAS
// ===========================================================================

// Faz o pedido ao servidor e devolve { ok, dados }.
//   metodo:  'GET', 'POST', 'PUT' ou 'DELETE'
//   dados:   o que queremos enviar (vira JSON)
async function pedir(metodo, endereco, dados) {
  try {
    const resposta = await fetch(endereco, {
      method: metodo,
      headers: { 'Content-Type': 'application/json' },
      body: dados ? JSON.stringify(dados) : undefined
    });
    const json = await resposta.json();
    return { ok: resposta.ok, dados: json };
  } catch (erro) {
    return {
      ok: false,
      dados: { erro: 'Não consegui falar com o servidor. Ele está rodando? O endereço é http://localhost:3000 ?' }
    };
  }
}


// Mostra uma mensagem embaixo do formulário.
//   tipo 'ok'   -> verde (some sozinha depois de 4 segundos, a não ser que fixo = true)
//   tipo 'erro' -> vermelho (fica na tela)
const relogios = {};

function avisar(idDoAviso, texto, tipo, fixo) {
  const aviso = document.getElementById(idDoAviso);
  aviso.textContent = texto;
  aviso.className = 'avisoFeedback ' + tipo;

  clearTimeout(relogios[idDoAviso]);

  if (tipo === 'ok' && !fixo) {
    relogios[idDoAviso] = setTimeout(() => {
      aviso.textContent = '';
      aviso.className = 'avisoFeedback';
    }, 4000);
  }
}


// Monta uma linha de tabela.
//   valores:  os textos de cada coluna
//   botoes:   lista de botões para a última coluna (pode ser vazia)
//
// Usamos textContent e não innerHTML: assim um nome com <script> dentro
// aparece como texto e não é executado.
function montarLinha(valores, botoes) {
  const linha = document.createElement('tr');

  valores.forEach((valor) => {
    const celula = document.createElement('td');
    celula.textContent = valor;
    linha.appendChild(celula);
  });

  const acoes = document.createElement('td');
  acoes.className = 'acoes';
  botoes.forEach((b) => acoes.appendChild(b));
  linha.appendChild(acoes);

  return linha;
}

function criarBotao(texto, classe, aoClicar) {
  const botao = document.createElement('button');
  botao.type = 'button';       // sem isto, dentro de um form ele ENVIARIA o form
  botao.className = classe + ' mini';
  botao.textContent = texto;
  botao.addEventListener('click', aoClicar);
  return botao;
}

function linhaVazia(corpo, colunas, texto) {
  const linha = document.createElement('tr');
  const celula = document.createElement('td');
  celula.colSpan = colunas;
  celula.className = 'vazio';
  celula.textContent = texto;
  linha.appendChild(celula);
  corpo.appendChild(linha);
}


// Cadastra (POST) se não tem id, ou altera (PUT) se tem id.
// Devolve o que o servidor respondeu, ou null se deu erro.
async function salvar(enderecoBase, idAtual, dados, idDoAviso) {
  const r = idAtual
    ? await pedir('PUT', enderecoBase + '/' + idAtual, dados)
    : await pedir('POST', enderecoBase, dados);

  if (!r.ok) {
    avisar(idDoAviso, r.dados.erro, 'erro');
    return null;
  }
  return r.dados;
}

// Pergunta e exclui (DELETE).
async function excluir(enderecoBase, id, pergunta, idDoAviso, mensagemOk) {
  if (!confirm(pergunta)) return;

  const r = await pedir('DELETE', enderecoBase + '/' + id);

  if (!r.ok) {
    avisar(idDoAviso, r.dados.erro, 'erro');
    return;
  }
  avisar(idDoAviso, mensagemOk, 'ok');
  atualizarTudo();
}


// ===========================================================================
//   3a. ABA: ALUNO
//
//   Repare que NÃO existe campo de ID no formulário. O banco cria o número.
//   O servidor devolve esse número em JSON e a gente mostra na tela.
// ===========================================================================

const formAluno = document.getElementById('formCadastroAluno');
const campoAluno = formAluno.elements;
const botaoSalvarAluno = document.getElementById('botaoSalvarAluno');
const botaoCancelarAluno = document.getElementById('botaoCancelarAluno');

async function listarAlunos() {
  const r = await pedir('GET', '/api/alunos');
  const corpo = document.getElementById('corpoTabelaAlunos');
  corpo.innerHTML = '';

  if (!r.ok) { avisar('avisoCadastroAluno', r.dados.erro, 'erro'); return; }
  if (r.dados.length === 0) linhaVazia(corpo, 9, 'Nenhum aluno matriculado.');

  r.dados.forEach((aluno) => {
    corpo.appendChild(montarLinha(
      [aluno.nome, aluno.cpf, aluno.login, aluno.cidade, aluno.telefone, aluno.cep, aluno.treinador_nome || 'Sem treinador', aluno.id],
      [
        criarBotao('editar', 'fraco', () => editarAluno(aluno)),
        criarBotao('excluir', 'perigo', () => excluir(
          '/api/alunos', aluno.id, 'Excluir o aluno ' + aluno.nome + '? As matrículas dele também serão apagadas.',
          'avisoCadastroAluno', 'Aluno excluído.'))
      ]
    ));
  });

  // Aproveitamos a lista para encher a caixa de escolha da aba Matrículas.
  const caixa = document.getElementById('formMatricula').elements.AlunoId;
  encherCaixa(caixa, r.dados, (a) => a.nome + ' (ID ' + a.id + ')', '-- escolha o atleta --');
}

formAluno.addEventListener('submit', async (evento) => {
  evento.preventDefault();   // sem isto a página recarrega e nada é salvo

  const dados = {
    nome: campoAluno.Nome.value,
    cpf: campoAluno.CPF.value,
    login: campoAluno.Gmail.value,
    cidade: campoAluno.Cidade.value,
    telefone: campoAluno.Telefone.value,
    cep: campoAluno.CEP.value,
    treinador_id: campoAluno.TreinadorId.value
  };

  const editando = campoAluno.AlunoId.value;
  const resposta = await salvar('/api/alunos', editando, dados, 'avisoCadastroAluno');
  if (!resposta) return;

  if (editando) {
    avisar('avisoCadastroAluno', 'Aluno alterado.', 'ok');
  } else {
    // resposta.id é o número que o banco criou
    avisar('avisoCadastroAluno',
      'Atleta matriculado! O ID de matrícula é ' + resposta.id + '.', 'ok', true);
  }
  limparFormAluno();
  atualizarTudo();
});

function editarAluno(aluno) {
  campoAluno.AlunoId.value = aluno.id;
  campoAluno.Nome.value = aluno.nome;
  campoAluno.CPF.value = aluno.cpf;
  campoAluno.Gmail.value = aluno.login;
  campoAluno.Cidade.value = aluno.cidade;
  campoAluno.Telefone.value = aluno.telefone;
  campoAluno.CEP.value = aluno.cep;
  campoAluno.TreinadorId.value = aluno.treinador_id || '';

  botaoSalvarAluno.textContent = 'Salvar alteração';
  botaoCancelarAluno.hidden = false;
  campoAluno.Nome.focus();
}

function limparFormAluno() {
  formAluno.reset();
  campoAluno.AlunoId.value = '';
  botaoSalvarAluno.textContent = 'Matricular Atleta';
  botaoCancelarAluno.hidden = true;
}

botaoCancelarAluno.addEventListener('click', limparFormAluno);


// ===========================================================================
//   3b. ABA: TREINADOR
// ===========================================================================

const formTreinador = document.getElementById('formCadastroTreinador');
const campoTreinador = formTreinador.elements;
const botaoSalvarTreinador = document.getElementById('botaoSalvarTreinador');
const botaoCancelarTreinador = document.getElementById('botaoCancelarTreinador');

async function listarTreinadores() {
  const r = await pedir('GET', '/api/treinadores');
  const corpo = document.getElementById('corpoTabelaTreinadores');
  corpo.innerHTML = '';

  if (!r.ok) { avisar('avisoCadastroTreinador', r.dados.erro, 'erro'); return; }
  if (r.dados.length === 0) linhaVazia(corpo, 6, 'Nenhum treinador cadastrado.');

  // Aproveitamos a lista para encher a caixa "Treinador do Aluno" da aba Aluno.
  encherCaixa(campoAluno.TreinadorId, r.dados,
    (t) => t.nome + ' (' + t.especialidade + ')', '-- sem treinador --');

  r.dados.forEach((t) => {
    corpo.appendChild(montarLinha(
      [t.nome, t.cdedf, t.login, t.especialidade, t.telefone],
      [
        criarBotao('editar', 'fraco', () => editarTreinador(t)),
        criarBotao('excluir', 'perigo', () => excluir(
          '/api/treinadores', t.id, 'Excluir o treinador ' + t.nome + '?',
          'avisoCadastroTreinador', 'Treinador excluído.'))
      ]
    ));
  });
}

formTreinador.addEventListener('submit', async (evento) => {
  evento.preventDefault();

  const dados = {
    nome: campoTreinador.Nome.value,
    cdedf: campoTreinador.CREF.value,
    login: campoTreinador.Email.value,
    especialidade: campoTreinador.Especialidade.value,
    telefone: campoTreinador.Telefone.value,
    senha: campoTreinador.Senha.value
  };

  const editando = campoTreinador.TreinadorId.value;
  const resposta = await salvar('/api/treinadores', editando, dados, 'avisoCadastroTreinador');
  if (!resposta) return;

  avisar('avisoCadastroTreinador', editando ? 'Treinador alterado.' : 'Treinador cadastrado com o ID ' + resposta.id + '.', 'ok');
  limparFormTreinador();
  atualizarTudo();
});

function editarTreinador(t) {
  campoTreinador.TreinadorId.value = t.id;
  campoTreinador.Nome.value = t.nome;
  campoTreinador.CREF.value = t.cdedf;
  campoTreinador.Email.value = t.login;
  campoTreinador.Especialidade.value = t.especialidade;
  campoTreinador.Telefone.value = t.telefone;

  // Na edição, a senha é opcional: vazia = continua a mesma.
  campoTreinador.Senha.value = '';
  campoTreinador.Senha.required = false;
  campoTreinador.Senha.placeholder = 'vazio = manter a senha';

  botaoSalvarTreinador.textContent = 'Salvar alteração';
  botaoCancelarTreinador.hidden = false;
  campoTreinador.Nome.focus();
}

function limparFormTreinador() {
  formTreinador.reset();
  campoTreinador.TreinadorId.value = '';
  campoTreinador.Senha.required = true;
  campoTreinador.Senha.placeholder = 'mínimo 6 caracteres';
  botaoSalvarTreinador.textContent = 'Cadastrar Treinador';
  botaoCancelarTreinador.hidden = true;
}

botaoCancelarTreinador.addEventListener('click', limparFormTreinador);


// ===========================================================================
//   3c. ABA: MODALIDADES
// ===========================================================================

const formModalidade = document.getElementById('formModalidade');
const campoModalidade = formModalidade.elements;
const botaoSalvarModalidade = document.getElementById('botaoSalvarModalidade');
const botaoCancelarModalidade = document.getElementById('botaoCancelarModalidade');

async function listarModalidades() {
  const r = await pedir('GET', '/api/modalidades');
  const corpo = document.getElementById('corpoTabelaModalidades');
  corpo.innerHTML = '';

  if (!r.ok) { avisar('avisoModalidade', r.dados.erro, 'erro'); return; }
  if (r.dados.length === 0) linhaVazia(corpo, 6, 'Nenhuma modalidade cadastrada.');

  r.dados.forEach((m) => {
    corpo.appendChild(montarLinha(
      [m.id, m.esporte, m.turno, m.turma, m.agenda],
      [
        criarBotao('editar', 'fraco', () => editarModalidade(m)),
        criarBotao('excluir', 'perigo', () => excluir(
          '/api/modalidades', m.id, 'Excluir a modalidade ' + m.esporte + '?',
          'avisoModalidade', 'Modalidade excluída.'))
      ]
    ));
  });

  // Enche a caixa de escolha da aba Matrículas.
  const caixa = document.getElementById('formMatricula').elements.ModalidadeId;
  encherCaixa(caixa, r.dados,
    (m) => m.esporte + ' - ' + m.turno + ', ' + m.agenda + ' (turma ' + m.turma + ')',
    '-- escolha a modalidade --');
}

formModalidade.addEventListener('submit', async (evento) => {
  evento.preventDefault();

  const dados = {
    esporte: campoModalidade.Esporte.value,
    turno: campoModalidade.Turno.value,
    turma: campoModalidade.Turma.value,
    agenda: campoModalidade.Agenda.value
  };

  const editando = campoModalidade.ModalidadeId.value;
  const resposta = await salvar('/api/modalidades', editando, dados, 'avisoModalidade');
  if (!resposta) return;

  avisar('avisoModalidade', editando ? 'Modalidade alterada.' : 'Modalidade cadastrada com o ID ' + resposta.id + '.', 'ok');
  limparFormModalidade();
  atualizarTudo();
});

function editarModalidade(m) {
  campoModalidade.ModalidadeId.value = m.id;
  campoModalidade.Esporte.value = m.esporte;
  campoModalidade.Turno.value = m.turno;
  campoModalidade.Turma.value = m.turma;
  campoModalidade.Agenda.value = m.agenda;

  botaoSalvarModalidade.textContent = 'Salvar alteração';
  botaoCancelarModalidade.hidden = false;
  campoModalidade.Esporte.focus();
}

function limparFormModalidade() {
  formModalidade.reset();
  campoModalidade.ModalidadeId.value = '';
  botaoSalvarModalidade.textContent = 'Cadastrar Modalidade';
  botaoCancelarModalidade.hidden = true;
}

botaoCancelarModalidade.addEventListener('click', limparFormModalidade);


// ===========================================================================
//   3d. ABA: MATRÍCULAS  (liga o aluno à modalidade)
//
//   O formulário tem duas caixas de escolha. A pessoa escolhe lendo o NOME,
//   mas o que vai para o servidor é o NÚMERO (value da opção).
// ===========================================================================

// Enche uma caixa de escolha (select) com uma lista que veio do servidor.
function encherCaixa(caixa, lista, textoDaOpcao, convite) {
  const escolhido = caixa.value;
  caixa.innerHTML = '';

  const primeira = document.createElement('option');
  primeira.value = '';
  primeira.textContent = convite;
  caixa.appendChild(primeira);

  lista.forEach((item) => {
    const opcao = document.createElement('option');
    opcao.value = item.id;                     // o número, para o banco
    opcao.textContent = textoDaOpcao(item);    // o nome, para a pessoa ler
    caixa.appendChild(opcao);
  });

  caixa.value = escolhido;
}

async function listarMatriculas() {
  const r = await pedir('GET', '/api/matriculas');
  const corpo = document.getElementById('corpoTabelaMatriculas');
  corpo.innerHTML = '';

  if (!r.ok) { avisar('avisoMatricula', r.dados.erro, 'erro'); return; }
  if (r.dados.length === 0) linhaVazia(corpo, 6, 'Nenhuma matrícula ainda.');

  r.dados.forEach((m) => {
    const matriculado = m.matriculado === 1;

    const botao = matriculado
      ? criarBotao('cancelar', 'perigo', () => excluir(
          '/api/matriculas', m.id,
          'Cancelar a matrícula de ' + m.aluno + '?\n\nATENÇÃO: o aluno sai de todas as tabelas ' +
          '(alunos, portal e lista do treinador) e fica aqui como "Não matriculado".',
          'avisoMatricula', 'Matrícula cancelada. O aluno agora está como não matriculado.'))
      : criarBotao('reativar', 'sucesso', () => reativarMatricula(m));

    const linha = montarLinha([m.esporte, m.turno, m.aluno, m.cpf, ''], [botao]);

    // A 5ª coluna é o status, com uma etiqueta colorida.
    const etiqueta = document.createElement('span');
    etiqueta.className = 'status ' + (matriculado ? 'matriculado' : 'naoMatriculado');
    etiqueta.textContent = matriculado ? 'Matriculado' : 'Não matriculado';
    linha.children[4].appendChild(etiqueta);

    corpo.appendChild(linha);
  });
}

async function reativarMatricula(m) {
  if (!confirm('Reativar a matrícula de ' + m.aluno + '?')) return;

  const r = await pedir('POST', '/api/matriculas/' + m.id + '/reativar');
  if (!r.ok) { avisar('avisoMatricula', r.dados.erro, 'erro'); return; }

  avisar('avisoMatricula', 'Matrícula reativada.', 'ok');
  atualizarTudo();
}

document.getElementById('formMatricula').addEventListener('submit', async (evento) => {
  evento.preventDefault();
  const form = evento.target.elements;

  const dados = { aluno_id: form.AlunoId.value, modalidade_id: form.ModalidadeId.value };
  const resposta = await salvar('/api/matriculas', '', dados, 'avisoMatricula');
  if (!resposta) return;

  avisar('avisoMatricula', 'Matrícula feita.', 'ok');
  evento.target.reset();
  atualizarTudo();
});


// ===========================================================================
//   3e. ABA: PORTAL (aluno ou treinador)
//
//   A pessoa escolhe "Entrar como": Aluno ou Treinador.
//     Aluno      -> digita o CPF ou o ID de matrícula e vê os dados dele,
//                   as modalidades e o treinador.
//     Treinador  -> entra com e-mail e senha e vê os dados dele e a lista
//                   dos alunos que escolheram ele.
// ===========================================================================

const formPortal = document.getElementById('formPortal');
const tipoPortal = document.getElementById('tipoPortal');
const campoPortal = formPortal.elements;
const camposPortalAluno = document.getElementById('camposPortalAluno');
const camposPortalTreinador = document.getElementById('camposPortalTreinador');
const botaoPortal = document.getElementById('botaoPortal');
const botaoLimparPortal = document.getElementById('botaoLimparPortal');
const resultadoPortal = document.getElementById('resultadoPortal');
const resultadoPortalTreinador = document.getElementById('resultadoPortalTreinador');

// Guardam quem está na tela, para atualizar quando algo mudar em outra aba.
let buscaPortal = '';          // aluno (ID de matrícula)
let treinadorPortalId = '';    // treinador (ID)

function esconderPortal() {
  buscaPortal = '';
  treinadorPortalId = '';
  resultadoPortal.hidden = true;
  resultadoPortalTreinador.hidden = true;
  botaoLimparPortal.hidden = true;
}

// Mostra os campos certos para quem foi escolhido (aluno ou treinador).
function trocarTipoPortal() {
  const ehAluno = tipoPortal.value === 'aluno';

  camposPortalAluno.hidden = !ehAluno;
  camposPortalTreinador.hidden = ehAluno;

  // Campo escondido não pode ser "required", senão o navegador trava o envio.
  campoPortal.Busca.required = ehAluno;
  campoPortal.LoginEmail.required = !ehAluno;
  campoPortal.LoginSenha.required = !ehAluno;

  botaoPortal.textContent = ehAluno ? 'Buscar Aluno' : 'Acessar Área Técnica';

  esconderPortal();
  avisar('avisoPortal', '', 'ok');
}

tipoPortal.addEventListener('change', trocarTipoPortal);


// Preenche um cartão com pares [rótulo, valor].
// textContent: nunca executa código vindo do banco.
function desenharCartao(cartao, campos) {
  cartao.innerHTML = '';

  campos.forEach(([rotulo, valor]) => {
    const item = document.createElement('div');
    item.className = 'itemAluno';

    const titulo = document.createElement('span');
    titulo.textContent = rotulo;

    const texto = document.createElement('strong');
    texto.textContent = valor;

    item.appendChild(titulo);
    item.appendChild(texto);
    cartao.appendChild(item);
  });
}

// Desenha uma tabela simples (sem botões) a partir de listas de textos.
function desenharLinhas(corpo, linhas, colunas, textoVazio) {
  corpo.innerHTML = '';
  if (linhas.length === 0) linhaVazia(corpo, colunas, textoVazio);

  linhas.forEach((valores) => {
    const linha = document.createElement('tr');
    valores.forEach((valor) => {
      const celula = document.createElement('td');
      celula.textContent = valor;
      linha.appendChild(celula);
    });
    corpo.appendChild(linha);
  });
}


// ---------------------------- PORTAL DO ALUNO ------------------------------

// Pede o aluno ao servidor e desenha. Devolve true se achou.
async function buscarPortal() {
  const r = await pedir('GET', '/api/portal/' + encodeURIComponent(buscaPortal));

  if (!r.ok) {
    esconderPortal();
    avisar('avisoPortal', r.dados.erro, 'erro');
    return false;
  }

  desenharPortal(r.dados.aluno, r.dados.modalidades, r.dados.treinador);

  // Daqui em diante buscamos pelo ID, que nunca muda (o CPF pode ser editado).
  buscaPortal = String(r.dados.aluno.id);
  return true;
}

function desenharPortal(aluno, modalidades, treinador) {
  desenharCartao(document.getElementById('cartaoAluno'), [
    ['ID de Matrícula', aluno.id],
    ['Nome', aluno.nome],
    ['CPF', aluno.cpf],
    ['E-mail', aluno.login],
    ['Cidade', aluno.cidade],
    ['Telefone', aluno.telefone],
    ['CEP', aluno.cep],
    ['Treinador', treinador ? treinador.nome + ' (' + treinador.especialidade + ')' : 'Sem treinador']
  ]);

  desenharLinhas(
    document.getElementById('corpoTabelaPortal'),
    modalidades.map((m) => [m.esporte, m.turno, m.turma, m.agenda]),
    4,
    'Este aluno ainda não está matriculado em nenhuma modalidade.'
  );

  resultadoPortalTreinador.hidden = true;
  resultadoPortal.hidden = false;
  botaoLimparPortal.hidden = false;
}


// --------------------------- PORTAL DO TREINADOR ---------------------------

// Atualiza a tela do treinador (depois que algo muda em outra aba).
async function buscarPortalTreinador() {
  const r = await pedir('GET', '/api/portal/treinador/' + encodeURIComponent(treinadorPortalId));

  if (!r.ok) {
    esconderPortal();
    avisar('avisoPortal', r.dados.erro, 'erro');
    return false;
  }

  desenharPortalTreinador(r.dados.treinador, r.dados.alunos);
  return true;
}

function desenharPortalTreinador(treinador, alunos) {
  desenharCartao(document.getElementById('cartaoTreinador'), [
    ['ID', treinador.id],
    ['Nome', treinador.nome],
    ['CREF', treinador.cdedf],
    ['E-mail', treinador.login],
    ['Modalidade Principal', treinador.especialidade],
    ['Telefone', treinador.telefone],
    ['Total de Alunos', alunos.length]
  ]);

  desenharLinhas(
    document.getElementById('corpoTabelaPortalTreinador'),
    alunos.map((a) => [a.id, a.nome, a.cpf, a.telefone, a.modalidades || 'Nenhuma']),
    5,
    'Nenhum aluno escolheu este treinador ainda.'
  );

  resultadoPortal.hidden = true;
  resultadoPortalTreinador.hidden = false;
  botaoLimparPortal.hidden = false;
}


// ------------------------------- ENVIO -------------------------------------

formPortal.addEventListener('submit', async (evento) => {
  evento.preventDefault();

  // ---- Aluno: CPF ou ID de matrícula
  if (tipoPortal.value === 'aluno') {
    esconderPortal();
    const busca = campoPortal.Busca.value.trim();

    if (!busca) {
      avisar('avisoPortal', 'Digite o CPF ou o ID de matrícula do aluno.', 'erro');
      return;
    }

    buscaPortal = busca;
    if (await buscarPortal()) avisar('avisoPortal', 'Aluno encontrado.', 'ok');
    return;
  }

  // ---- Treinador: e-mail + senha
  esconderPortal();
  const r = await pedir('POST', '/api/login/treinador', {
    email: campoPortal.LoginEmail.value,
    senha: campoPortal.LoginSenha.value
  });

  if (!r.ok) { avisar('avisoPortal', r.dados.erro, 'erro'); return; }

  campoPortal.LoginSenha.value = '';       // a senha não fica na tela
  treinadorPortalId = String(r.dados.id);
  desenharPortalTreinador(r.dados.treinador, r.dados.alunos);
  avisar('avisoPortal', 'Bem-vindo, ' + r.dados.nome + '!', 'ok');
});

botaoLimparPortal.addEventListener('click', () => {
  formPortal.reset();
  trocarTipoPortal();
  campoPortal.Busca.focus();
});


// ===========================================================================
//   4. COMEÇO
//
//   Pede tudo ao servidor e desenha as tabelas. É chamada quando a
//   página abre e toda vez que algo muda.
// ===========================================================================

function atualizarTudo() {
  listarAlunos();
  listarTreinadores();
  listarModalidades();
  listarMatriculas();
  if (buscaPortal) buscarPortal();                    // mantém o Portal do Aluno atualizado
  if (treinadorPortalId) buscarPortalTreinador();     // e o do Treinador
}

atualizarTudo();
