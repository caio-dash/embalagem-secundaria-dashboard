[README.md](https://github.com/user-attachments/files/33117519/README.md)
# Testes automatizados — Dashboard Embalagem Secundária

Testes de regressão para a lógica crítica dos dois dashboards. Rodam em Node.js puro
(sem instalar nada — `vm`, `fs`, `path`, `child_process` já vêm com o Node), simulando
o comportamento de `window`/`document`/Supabase com objetos simples, e executando o
**código real** extraído de `index.html` / `editar.html` / `dashboard-core.js` — não
uma reimplementação separada da lógica.

## Pré-requisito

Qualquer versão razoavelmente recente do Node.js (testado com a v22). Nada para
instalar — sem `npm install`, sem dependências externas.

## Como rodar

Da raiz do repositório (onde ficam `index.html`, `editar.html`, `dashboard-core.js`):

```bash
node tests/rodar-tudo.js
```

Isso roda os três arquivos de teste em sequência e mostra um resumo no final. Para
rodar um teste específico (mais rápido, ao mexer em só uma parte do código):

```bash
node tests/teste-dados-fallback.js
node tests/teste-bloqueio-salvamento.js
node tests/teste-bloqueio-kit-medico.js
```

Funciona tanto rodando da raiz do repositório quanto de dentro da própria pasta
`tests/` — os caminhos são resolvidos automaticamente em relação à raiz, não ao
diretório de onde o comando foi chamado.

## O que cada teste cobre

| Arquivo | O que testa | Cenários |
|---|---|---|
| `teste-dados-fallback.js` | Carregamento de dados: Supabase OK, erro, sem rede, banco vazio, arquivo `dados-fallback.json` ausente/em formatos diferentes, ordem de inicialização do dashboard | 9 cenários × 2 arquivos (Visualização e Editável) |
| `teste-bloqueio-salvamento.js` | Bloqueio do botão de salvar quando o estado do Supabase não pôde ser confirmado ao carregar (Linha Principal) | 5 cenários |
| `teste-bloqueio-kit-medico.js` | Mesmo bloqueio, mas para o Kit Médico (carrega/salva de forma independente da Linha Principal) | 3 cenários |

## O que isso NÃO substitui

Estes testes verificam **lógica** (JS puro: o que uma função faz dado uma entrada),
não **renderização visual** nem **interação real de mouse/teclado em navegador**. Eles
não abrem um navegador de verdade — não pegam, por exemplo, problemas de CSS, de
clique em gráfico (Chart.js), ou de como algo aparece na tela. Para isso, continue
usando o checklist manual da seção 9 do `README.md` principal antes de cada deploy.

## Quando atualizar estes testes

Sempre que uma função testada aqui for alterada (ou movida entre `dashboard-core.js`
e os HTMLs), rode os testes de novo — se um marcador de texto usado para extrair o
código mudou (ex.: o nome da próxima função no arquivo, usado como "fim" da extração),
o teste vai falhar com um erro claro tipo `"fim não encontrado"`, não um falso
positivo silencioso. Ajuste o marcador correspondente no arquivo de teste e rode de
novo.

Ao adicionar um teste novo, salve como `tests/teste-<nome-da-funcionalidade>.js` — o
`rodar-tudo.js` pega automaticamente qualquer arquivo que comece com `teste-` nesta
pasta, sem precisar listar manualmente.
