// Porteiro de versao do Node, rodado ANTES do server.mjs.
//
// Por que um arquivo separado: o server.mjs importa `node:sqlite` (db.mjs), e
// import de ESM e resolvido antes de qualquer linha de codigo rodar. Uma
// checagem dentro do proprio server.mjs nunca chegaria a executar — o processo
// morre na resolucao do modulo, com um ERR_UNKNOWN_BUILTIN_MODULE que nao diz
// ao usuario o que fazer. Foi o que aconteceu numa VPS com Node 20 em
// 2026-08-18: o servidor saia com codigo 1 e so o Vite subia, entao a tela
// respondia e toda chamada /api/ dava ECONNREFUSED — sintoma que parece rede,
// causa que e versao.

const REQUIRED = { major: 22, minor: 5 };

const [major, minor] = process.versions.node.split(".").map(Number);
const ok = major > REQUIRED.major || (major === REQUIRED.major && minor >= REQUIRED.minor);

if (!ok) {
  const need = `${REQUIRED.major}.${REQUIRED.minor}`;
  process.stderr.write(
    `\n  Node ${process.versions.node} e antigo demais para este servidor.\n` +
    `  E preciso Node ${need} ou mais novo: o banco usa o modulo interno\n` +
    `  node:sqlite, que so existe a partir do ${need}.\n\n` +
    `  Para atualizar no Ubuntu/Debian:\n` +
    `    curl -fsSL https://deb.nodesource.com/setup_24.x | sudo bash -\n` +
    `    sudo apt-get install -y nodejs\n` +
    `    rm -rf node_modules && npm install\n\n` +
    `  Com nvm, sem tocar no Node do sistema:\n` +
    `    nvm install 24 && nvm use 24\n\n`
  );
  process.exit(1);
}
