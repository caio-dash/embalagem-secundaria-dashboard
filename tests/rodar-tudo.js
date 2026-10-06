// Roda todos os testes da pasta /tests em sequência e resume o resultado no final.
// Uso: node tests/rodar-tudo.js   (de qualquer diretório — os caminhos são relativos
// à raiz do repositório automaticamente, não ao diretório de onde você chama o comando)
const { execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const pasta = __dirname;
const arquivos = fs.readdirSync(pasta)
  .filter(f => f.startsWith('teste-') && f.endsWith('.js'))
  .sort();

console.log(`Encontrados ${arquivos.length} arquivos de teste em ${pasta}:\n  - ` + arquivos.join('\n  - ') + '\n');

let passou = 0, falhou = 0;
const falhas = [];

for (const arq of arquivos) {
  const caminho = path.join(pasta, arq);
  process.stdout.write(`\n════════════════════ ${arq} ════════════════════\n`);
  try {
    const saida = execFileSync('node', [caminho], { encoding: 'utf-8' });
    process.stdout.write(saida);
    passou++;
  } catch (e) {
    process.stdout.write(e.stdout || '');
    process.stderr.write(e.stderr || String(e));
    falhou++;
    falhas.push(arq);
  }
}

console.log('\n\n════════════════════ RESUMO ════════════════════');
console.log(`${passou}/${arquivos.length} arquivo(s) de teste passaram por completo.`);
if (falhou) {
  console.log(`❌ Falharam: ${falhas.join(', ')}`);
  process.exit(1);
} else {
  console.log('✅ Tudo passou.');
  process.exit(0);
}
