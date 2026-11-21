# Auditoria técnica do Teco IA

**Data:** 2026-11-21
**Escopo:** implementação existente no repositório, com foco na integração de IA do Tocaê.  
**Tipo:** auditoria documental baseada em código e testes; não é teste de penetração nem validação com serviços externos.

## 1. Resumo executivo

O Teco é um assistente conversacional funcional, integrado ao processo principal do Electron e aos dados de reprodução do Tocaê. A integração inclui streaming, histórico de uma conversa, provedores configuráveis, ferramentas limitadas para consultar a biblioteca, a fila, favoritos e reproduções recentes (estes dois últimos com consentimentos separados e desativados por padrão), recomendações locais explicáveis com opt-in e feedback explícito, análise sob demanda do humor do áudio, descrição de imagens e resumo de quadros de vídeo via Gemini após confirmação a cada envio, controles básicos do player e propostas que podem ser salvas como playlists locais nomeadas ou aplicadas à fila somente por ação explícita.

O Gemini usa o SDK oficial `@google/genai`, incluindo geração em streaming, descoberta de modelos, embeddings e chamadas de ferramentas. O fluxo mantém as partes originais do modelo necessárias para preservar `thoughtSignature`. O uso do SDK não significa que a Interactions API esteja integrada: a implementação atual usa `models.generateContentStream` e um ciclo manual de ferramentas, com até cinco turnos. A auditoria inicial não fez chamada real ao Gemini; um smoke test posterior limitado está registrado na seção 11.

**Resultado da matriz de 80 critérios:**

| Estado | Quantidade | Definição |
|---|---:|---|
| Implementado | 29 (36,25%) | Fluxo funcional identificado no código; as limitações estão registradas quando relevantes. |
| Parcial | 24 (30%) | Há uma versão limitada, mas faltam partes relevantes do comportamento esperado. |
| Não implementado | 27 (33,75%) | Não foi encontrado fluxo integrado do Teco para o critério. |
| Apenas interface / estrutura preparada | 0 | Não foi identificado critério cujo único suporte seja uma tela ou estrutura sem fluxo funcional. |

O resultado não deve ser interpretado como percentual de qualidade ou prontidão: cada critério tem peso igual, e a classificação “parcial” não mede profundidade.

### Indicadores estimados

Para a matriz geral, atribuir 1 ponto a “implementado”, 0,5 a “parcial” e 0 a “não implementado” resulta em **51,25%** (41/80). Os indicadores por área abaixo são estimativas de completude funcional, não métricas observadas em produção.

| Área | Estimativa | Base |
|---|---:|---|
| Conversação e interface | 75–81% | Chat, streaming, provedores, ferramentas e fluxo principal existentes; contexto, sessões, persistência e cancelamento ainda limitados. |
| Infraestrutura de IA | 70–80% | Separação Main/Preload/Renderer, adaptadores, IPC tipado e armazenamento seguro de credenciais; faltam limites de uso e validação real dos provedores. |
| Busca da biblioteca | ~70% | Busca textual e filtros por título, artista, álbum e gênero existem; a busca semântica ainda indexa apenas nome, caminho e tipo. |
| Playlists | ~60% | É possível salvar e editar playlists nomeadas localmente, inclusive propostas do Teco; a seleção automática continua lexical e não aplica preferências musicais. |
| Favoritos e histórico | ~55% | Consulta favoritos e até 20 reproduções recentes sob demanda, com consentimentos separados; recomendações locais usam favoritos e avaliações explícitas, sem analisar o histórico de reprodução. |
| Recomendações | ~42% | Sugestões locais limitadas a tags de artista, álbum e gênero, com justificativa e feedback; não há recomendação de artistas/álbuns ou análise sonora. |
| Análise musical | ~21% | Análise qualitativa e sob demanda de humor, energia, instrumentos e ritmo aproximado em áudio enviado ao Gemini com consentimento por arquivo; não calcula BPM nem grava tags. |
| Controle do player | ~80% dos controles básicos | Play, pause, próximo e anterior estão disponíveis; volume e navegação da aplicação não estão expostos ao agente. |
| Análise de vídeo | ~20% | Resumo de até 8 quadros extraídos localmente de vídeos com até 10 minutos, sob opt-in e confirmação por envio; não analisa áudio, transcreve falas nem cria capítulos. |
| Organização automática | ~38% | Prévia local por metadados/tipo, aplicação confirmada, proteção contra sobrescrita e desfazer; ainda não renomeia arquivos nem usa gênero/IA. |
| Descrição de imagens | ~8% | Uma descrição sob demanda da imagem atual da fila, condicionada a opt-in e confirmação por envio; sem OCR, busca visual ou contexto de imagem no chat. |

**Conclusão:** a base de conversa e integração é real e inclui curadoria local limitada, classificação qualitativa de áudio, descrição de imagem, resumo limitado de quadros de vídeo e organização local confirmada. O Teco ainda não oferece curadoria musical abrangente, renomeação automática ou organização por gênero. A análise de áudio depende do Gemini e foi smoke-tested em uma amostra autorizada. Imagens e quadros de vídeo ainda não foram enviados a um serviço externo. Os maiores riscos práticos são privacidade dos dados enviados ao provedor e arquivos locais de histórico/índice/avaliações sem criptografia.

## 2. Matriz consolidada dos 80 critérios

Legenda: **I** = implementado; **P** = parcial; **N** = não implementado.

| Grupo | I | P | N |
|---|---:|---:|---:|
| A. Conversação e interface | 8 | 5 | 0 |
| B. Busca da biblioteca | 5 | 4 | 1 |
| C. Playlists | 3 | 1 | 4 |
| D. Organização de arquivos | 3 | 3 | 2 |
| E. Histórico de reprodução e favoritos | 3 | 1 | 2 |
| F. Recomendações | 1 | 3 | 2 |
| G. Inteligência musical | 0 | 3 | 4 |
| H. Análise de vídeo | 0 | 2 | 3 |
| I. Análise de imagem | 0 | 1 | 5 |
| J. Integração e ações | 6 | 2 | 3 |
| **Total** | **26** | **22** | **32** |

## 3. Matriz detalhada

Cada linha registra o comportamento encontrado e a principal lacuna. “Não encontrado” significa que não há fluxo integrado do agente para a capacidade; não significa que o reprodutor não tenha uma função independente relacionada.

### A. Conversação e interface

| # | Critério | Estado | Evidência e comportamento / limitação |
|---|---|---|---|
| A1 | Interface de chat | I | [AssistantPage.tsx](../../src/features/ai/AssistantPage.tsx) implementa a tela de conversa, mensagens, composição e estado do agente. |
| A2 | Integração com provedores de LLM | I | [provider.ts](../../electron/ai/provider.ts) implementa o adaptador Gemini e o adaptador HTTP OpenAI-compatible; a integração não foi validada com credenciais reais. |
| A3 | Envio e recebimento de mensagens | I | [core.ts](../../electron/ai/core.ts) coordena a chamada e [index.ts](../../electron/ai/index.ts) registra o IPC. |
| A4 | Resposta em streaming | I | O adaptador processa chunks e o renderer recebe eventos de streaming por [preload.ts](../../electron/preload.ts) e [AssistantPage.tsx](../../src/features/ai/AssistantPage.tsx). |
| A5 | Entrada em linguagem natural | I | O texto do usuário é enviado ao modelo, que pode selecionar ferramentas; interpretação e qualidade dependem do modelo, sem parser determinístico próprio. |
| A6 | Contexto da conversa | P | [core.ts](../../electron/ai/core.ts) mantém até 50 mensagens; não há contagem de tokens, sumarização ou estratégia de corte baseada no limite do provedor. |
| A7 | Conversas/sessões de chat | P | Há uma conversa persistida, não gerenciamento de múltiplas conversas, títulos, seleção ou arquivamento. |
| A8 | Persistência do histórico | P | [historyStore.ts](../../electron/ai/historyStore.ts) valida e grava mensagens; o histórico é texto JSON sem criptografia e falha de escrita não é necessariamente apresentada ao usuário. |
| A9 | Tratamento de erros | P | [index.ts](../../electron/ai/index.ts) normaliza erros e o core tem timeout; não há política geral de retry/backoff nem cobertura comprovada de todos os erros de rede/provedor. |
| A10 | Estado de carregamento | I | A tela reflete o estado de solicitação/streaming e permite acompanhar a resposta em andamento. |
| A11 | Cancelamento | P | O core usa `AbortController` e timeout de 60 s; geração semântica inicia outro controller, não ligado ao cancelamento da conversa, portanto a operação pode continuar. |
| A12 | Configuração de provedor/modelo | I | [AiSection.tsx](../../src/features/settings/AiSection.tsx) oferece configurações de provedor/modelo e descoberta de modelos Gemini; não há descoberta uniforme para todos os provedores. |
| A13 | Armazenamento da credencial | I | [index.ts](../../electron/ai/index.ts) usa `safeStorage` do Electron para cifrar a credencial no processo principal; depende de `safeStorage` disponível no sistema. |

### B. Busca da biblioteca

| # | Critério | Estado | Evidência e comportamento / limitação |
|---|---|---|---|
| B1 | Busca da biblioteca por linguagem natural | P | O modelo pode acionar busca lexical ou semântica; não há tradução determinística de filtros complexos ou validação de intenção. |
| B2 | Busca semântica | P | [semanticIndex.ts](../../electron/ai/semanticIndex.ts) persiste embeddings e calcula similaridade; o texto indexado é nome, caminho relativo e tipo, não conteúdo ou metadados musicais completos. |
| B3 | Busca por título | I | [tools.ts](../../electron/ai/tools.ts) pesquisa título extraído e usa o nome do arquivo como fallback; os metadados são lidos sob demanda. |
| B4 | Busca por artista | I | A busca estruturada compara o filtro com a tag de artista extraída pelo [metadata.ts](../../electron/media/metadata.ts). |
| B5 | Busca por álbum | I | A busca estruturada compara o filtro com a tag de álbum extraída; pode combinar filtros de artista, título e gênero. |
| B6 | Busca por gênero | I | A busca estruturada corresponde a qualquer gênero extraído, sem diferenciar caixa ou acentos. |
| B7 | Filtro por tipo de mídia | I | A busca aceita filtro por tipo, incluindo áudio/vídeo/imagem, limitado aos itens registrados na biblioteca. |
| B8 | Resposta contextual sobre resultados | P | O modelo pode explicar os resultados retornados pela ferramenta; os resultados têm contexto limitado e não existe ranking/racionalização musical abrangente. |
| B9 | Filtros e refinamento | P | Tipo, título, artista, álbum e gênero podem ser combinados; ainda não há filtros por duração nem ordenação/ranking musical dedicado. |
| B10 | Recomendar itens relacionados na biblioteca | N | Similaridade textual/semântica da busca não equivale a uma recomendação integrada de itens relacionados ou baseada no gosto do usuário. |

### C. Playlists

| # | Critério | Estado | Evidência e comportamento / limitação |
|---|---|---|---|
| C1 | Criar playlist | I | O usuário pode salvar a fila atual ou uma proposta do Teco como playlist nomeada local e persistente, sem alterar a fila ao salvar. |
| C2 | Selecionar itens automaticamente | P | A seleção usa correspondência lexical em nome/caminho/tipo e é limitada; não usa preferências, histórico ou compreensão musical aprofundada. |
| C3 | Montar playlist por gênero | N | Não há busca integrada por gênero nem geração de playlist com esse atributo. |
| C4 | Montar playlist por humor/contexto | N | Não há classificação de humor, contexto ou energia musical. |
| C5 | Montar playlist por similaridade musical | N | Não há análise de áudio ou embeddings de conteúdo musical para este fim. |
| C6 | Reorganizar uma playlist por critérios musicais | N | O Teco não oferece ferramenta para reordenar itens por gênero, energia, ritmo ou transições. |
| C7 | Usar a fila existente | I | A ferramenta consulta a fila atual e a aplicação da proposta integra os itens com o estado do player. |
| C8 | Confirmar antes de substituir a fila | I | A proposta é apresentada na interface e só substitui a fila após ação explícita de confirmação. |

### D. Organização de arquivos

| # | Critério | Estado | Evidência e comportamento / limitação |
|---|---|---|---|
| D1 | Criar pastas automaticamente | P | A aplicação cria as pastas destino necessárias para itens prontos, mas não oferece criação de estrutura arbitrária pelo agente. |
| D2 | Mover arquivos automaticamente | P | Itens prontos são movidos após confirmação nativa; conflitos são ignorados e não há operação solicitada por linguagem natural. |
| D3 | Renomear arquivos | N | Não há ferramenta de renomeação. |
| D4 | Organizar por artista | I | O plano local usa o artista extraído para construir a primeira pasta de áudio. |
| D5 | Organizar por álbum | I | O plano local usa o álbum extraído para construir a segunda pasta de áudio. |
| D6 | Organizar por gênero | N | A organização por metadados não está integrada ao agente. |
| D7 | Detectar duplicatas e agir sobre elas | P | Destinos existentes e nomes duplicados são detectados e ignorados pela aplicação; não há remoção ou substituição segura de duplicatas. |
| D8 | Pré-visualizar e confirmar operações de organização | I | O plano mostra destinos, conflitos e itens já organizados; a aplicação exige confirmação nativa, evita sobrescrita e permite desfazer nesta sessão. |

### E. Histórico de reprodução e favoritos

| # | Critério | Estado | Evidência e comportamento / limitação |
|---|---|---|---|
| E1 | Histórico de reprodução acessível ao Teco | I | Com consentimento, o Teco consulta até 20 registros recentes; cada registro local contém nome, tipo e horário, sem caminho do arquivo. O histórico mantém até 500 entradas e não inclui duração. |
| E2 | Registrar itens ouvidos recentemente | I | Inícios de reprodução de áudio/vídeo local são registrados somente com consentimento explícito; mídia remota e imagens não são coletadas. |
| E3 | Consultar frequência/duração de reprodução | N | Não existe armazenamento ou ferramenta analítica de sessões de escuta. |
| E4 | Ler favoritos existentes | I | Com consentimento separado, a ferramenta retorna nomes e tipos dos favoritos que ainda correspondem a itens da biblioteca; não retorna caminhos absolutos. |
| E5 | Adicionar/remover favoritos por conversa | N | Não há ferramenta autorizada de mutação de favoritos. |
| E6 | Usar histórico/favoritos para personalização | P | Recomendações locais podem usar favoritos e avaliações explícitas; o histórico de reprodução não é usado para personalizar sugestões. |

### F. Recomendações

| # | Critério | Estado | Evidência e comportamento / limitação |
|---|---|---|---|
| F1 | Recomendar músicas personalizadas | P | Recomendações locais opt-in usam até 50 faixas favoritas/curtidas como sinais, comparando tags de artista, álbum e gênero; não usam histórico nem enviam dados ao provedor. A análise avalia no máximo 300 candidatas por solicitação. |
| F2 | Recomendar artistas | N | Não há recomendador de artistas. |
| F3 | Recomendar álbuns | N | Não há recomendador de álbuns. |
| F4 | Recomendar conteúdo semelhante | P | Tags locais de artista, álbum e gênero são comparadas; não há análise de similaridade sonora. |
| F5 | Aprender com feedback/curtidas | P | Curtidas viram sinais locais para sugestões seguintes e “não tenho interesse” exclui a faixa; não há perfil remoto ou ajuste automático de pesos. |
| F6 | Explicar recomendações com sinais do usuário | I | Cada sugestão indica o artista/álbum/gênero correspondente e a faixa favorita ou curtida usada como sinal. O usuário pode desativar a função ou apagar avaliações. |

### G. Inteligência musical

| # | Critério | Estado | Evidência e comportamento / limitação |
|---|---|---|---|
| G1 | Reconhecer humor/energia a partir do áudio | P | O fluxo opt-in pede ao Gemini uma estimativa qualitativa do clima e da energia de uma faixa atual da biblioteca; um smoke test autorizado retornou classificação plausível, não persistida. |
| G2 | Reconhecer BPM/ritmo | P | O modelo estimou cerca de 120 BPM na amostra, mas não há cálculo de BPM nem análise local de sinal; o valor é apenas uma estimativa. |
| G3 | Reconhecer instrumentos | P | O Gemini descreveu instrumentos perceptíveis na amostra; a classificação é qualitativa e não foi verificada localmente. |
| G4 | Transcrever ou entender letras | N | Não há transcrição nem análise de letras. |
| G5 | Detectar segmentos/estrutura da faixa | N | Não há análise de estrutura musical. |
| G6 | Classificar ou enriquecer tags automaticamente | N | Extração local de metadados não é classificação musical por IA nem grava tags. |
| G7 | Usar análise musical para busca/recomendação | N | As ferramentas não consomem características sonoras. |

### H. Análise de vídeo

| # | Critério | Estado | Evidência e comportamento / limitação |
|---|---|---|---|
| H1 | Resumir o conteúdo de um vídeo | P | Com opt-in e confirmação por envio, o Teco resume até 8 quadros extraídos localmente de um vídeo de até 10 minutos. O vídeo original não é enviado; não há análise de áudio, transcrição ou persistência, e o fluxo não foi testado com serviço externo. |
| H2 | Gerar ou consultar transcrição/legendas | N | Não há pipeline de transcrição de vídeo integrado. |
| H3 | Pesquisar dentro de um vídeo | N | Não há indexação temporal de cenas ou fala. |
| H4 | Identificar cenas/objetos em vídeo | P | O resumo pode descrever cenas e objetos visíveis nos quadros amostrados; não há rastreamento contínuo nem detecção exaustiva ao longo do vídeo. |
| H5 | Criar capítulos ou timestamps com IA | N | Não há geração de capítulos/timestamps. |

### I. Análise de imagem

| # | Critério | Estado | Evidência e comportamento / limitação |
|---|---|---|---|
| I1 | Descrever imagens da biblioteca | P | Com opt-in independente, a imagem atual da fila pode ser enviada ao Gemini após confirmação nativa por envio; aceita JPEG, PNG e WebP até 10 MiB. O resultado fica apenas em memória na tela e não foi testado com serviço externo. |
| I2 | Reconhecer objetos/cenas | N | Não há ferramenta de visão computacional para o Teco. |
| I3 | OCR em imagens | N | Não há extração de texto de imagem integrada. |
| I4 | Pesquisar imagens por conteúdo visual | N | O índice semântico usa campos textuais do item, não embeddings visuais. |
| I5 | Analisar capa/arte de álbum por IA | N | Metadados/capas existentes no player não são enviados a uma ferramenta visual do Teco. |
| I6 | Usar imagens como contexto conversacional | N | O fluxo de conversa não anexa imagens como conteúdo multimodal. |

### J. Integração e ações

| # | Critério | Estado | Evidência e comportamento / limitação |
|---|---|---|---|
| J1 | Reproduzir mídia | I | A ferramenta `player_play` aciona o player; o escopo é a mídia/fila disponível no Tocaê. |
| J2 | Pausar mídia | I | A ferramenta `player_pause` está registrada no catálogo de ferramentas. |
| J3 | Avançar para o próximo item | I | A ferramenta `player_next` está registrada e despachada no processo principal. |
| J4 | Voltar ao item anterior | I | A ferramenta `player_previous` está registrada e despachada no processo principal. |
| J5 | Controlar volume por conversa | N | Não foi encontrada ferramenta de volume no catálogo do agente. |
| J6 | Navegar pelas telas/abrir configurações | N | Não há ferramenta para navegar na aplicação ou abrir/alterar configurações. |
| J7 | Localizar mídia na biblioteca | P | O Teco pode pesquisar e retornar resultados; isso não implica acesso irrestrito a arquivos ou busca por todos os metadados. |
| J8 | Criar e aplicar playlist | P | Pode propor e aplicar uma seleção temporária na fila; não cria playlists salvas/nomeadas. |
| J9 | Gerenciar favoritos | N | Favoritos permanecem fora do catálogo de ferramentas. |
| J10 | Ferramentas tipadas e restritas | I | [tools.ts](../../electron/ai/tools.ts) declara ferramentas específicas; [index.ts](../../electron/ai/index.ts) despacha por nomes conhecidos, sem ferramenta genérica de shell/filesystem. |
| J11 | Confirmar ação destrutiva | I | A única mutação relevante exposta é aplicar a proposta à fila, protegida por confirmação na interface; não se conclui que todas as ações possíveis do player precisem de confirmação. |

## 4. Arquitetura e integração

### Fluxo de execução

1. A tela [AssistantPage.tsx](../../src/features/ai/AssistantPage.tsx) chama a API tipada exposta pelo preload.
2. [preload.ts](../../electron/preload.ts) expõe uma ponte restrita por `contextBridge`; não entrega `ipcRenderer` diretamente ao renderer.
3. [index.ts](../../electron/ai/index.ts) valida configuração, credencial e chamadas IPC, instancia o provedor e conecta as ferramentas autorizadas.
4. [core.ts](../../electron/ai/core.ts) adiciona as instruções de escopo do Tocaê, controla histórico, timeout, cancelamento e streaming.
5. [provider.ts](../../electron/ai/provider.ts) traduz o fluxo ao Gemini SDK ou ao endpoint HTTP compatível com OpenAI.
6. As ferramentas leem a biblioteca/fila ou acionam operações de player; a aplicação de playlist passa por confirmação no renderer.

### Pontos fortes

- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true` e DevTools desabilitadas na janela de produção, conforme [windows.ts](../../electron/windows.ts).
- Contratos de IPC e dados de IA definidos em [shared/ipc.ts](../../shared/ipc.ts) e [shared/ai.ts](../../shared/ai.ts).
- Chave armazenada no Main e cifrada com `safeStorage`, em vez de persistida em configuração do renderer.
- Catálogo fechado de ferramentas. Não foi encontrada ferramenta de shell, execução arbitrária de código ou acesso genérico ao filesystem.
- Prompt de sistema do Teco é enviado à chamada, mas não é gravado como mensagem comum do histórico.
- Persistência de histórico/índice usa gravação temporária e renomeação; arquivos são validados ao ler.
- Proposta de playlist separa recomendação do efeito de substituir a fila.

### Limitações arquiteturais

- [index.ts](../../electron/ai/index.ts) concentra composição, persistência de credencial, configuração, validação IPC, busca e integração de ferramentas; com o crescimento de capacidades, esse ponto tende a acumular responsabilidades.
- O histórico é uma conversa única com limite de quantidade de mensagens, não de tokens ou bytes. Mensagens grandes podem exceder limites/custos do provedor.
- Não há política de retry/backoff, rate limit ou quota/custo por usuário. O timeout de geração é 60 s.
- A geração de embeddings para busca semântica usa um `AbortController` independente, portanto não acompanha o cancelamento do pedido conversacional.
- A configuração/adaptador OpenAI-compatible usa endpoints `/chat/completions` e `/embeddings`; compatibilidade real de ferramentas/streaming varia por servidor/modelo e não há verificação uniforme de capacidades.
- O seletor dinâmico de modelos é específico do Gemini. Para outros provedores, o modelo é informado/configurado pelo usuário.
- O índice semântico representa nome, caminho relativo e tipo, não conteúdo do arquivo, tags completas, histórico ou preferências.
- Não há teste de interface/end-to-end nesta auditoria; os testes existentes são predominantemente unitários e usam mocks.

## 5. Gemini: estado da integração

| Capacidade | Implementação verificada | Limitação/observação |
|---|---|---|
| SDK | `@google/genai` 2.32.0 no [provider.ts](../../electron/ai/provider.ts) | A versão instalada inclui `interactions.create`; a documentação lista suporte no SDK JS desde 2.3.0. |
| Geração | `models.generateContentStream` | Não usa `Interactions API`; `generateContent` continua totalmente suportada, embora a Google recomende Interactions para novos desenvolvimentos. |
| Instrução do sistema | `systemInstruction` separada do histórico | O escopo é orientação para o modelo, não uma barreira de autorização; a barreira efetiva são as ferramentas disponíveis. |
| Chamada de ferramentas | Declarações Gemini e loop client-side limitado no adaptador | Até cinco chamadas por solicitação; a aplicação executa ferramentas locais e devolve resultados ao modelo. |
| Streaming | `generateContentStream` traduz chunks de texto para a interface | Interactions também oferece streaming, mas em eventos tipados de etapas; a adaptação e o comportamento de cancelamento precisariam de testes. |
| `thoughtSignature` | Partes originais do modelo são preservadas ao continuar a conversa | Coberto por teste mockado e smoke test real de tool call; não comprova compatibilidade de todos os modelos. |
| Modelos | Lista remota filtrada para capacidade `generateContent` | Se migrar, será necessário confirmar separadamente compatibilidade com Interactions para os modelos exibidos. |
| Embeddings | `models.embedContent`, usado pelo índice semântico | Cancelamento propagado após o P1; o índice contém apenas nome/caminho/tipo. |
| Erros e limites | Erros normalizados; limites de contexto/resposta e cancelamento aplicados | O smoke test não mede latência, quota ou custos em uso contínuo. |

**Conclusão Gemini:** a migração ao SDK oficial está implementada e coberta por testes; um smoke test real posterior verificou streaming e chamada de ferramenta usando estado simulado. A adoção da Interactions API é uma decisão de arquitetura separada, não uma descrição da implementação atual.

### Comparação e decisão de migração

A comparação foi feita com a [visão geral da Interactions API](https://aistudio.google.com/docs/interactions-overview), o [guia oficial de migração](https://aistudio.google.com/docs/migrate-to-interactions) e os tipos da versão `@google/genai` 2.32.0 instalada no projeto.

| Aspecto | `generateContentStream` atual | Interactions API |
|---|---|---|
| Suporte e recomendação | Continua totalmente suportada; a Google recomenda Interactions para novos desenvolvimentos. | Interface atual recomendada pela Google para fluxos agentic. |
| Histórico | Teco mantém e limita o histórico local e envia o contexto necessário a cada solicitação. | `previous_interaction_id` permite estado no servidor, mas exige armazenamento da interação. |
| Retenção | Não cria o estado de conversa da Interactions API. | `store` é `true` por padrão; a documentação informa retenção de 1 dia no nível gratuito e 55 dias no pago. `store: false` desativa o armazenamento da interação e não permite continuar com `previous_interaction_id`. |
| Ferramentas locais | Loop client-side existente, com dispatcher restrito no processo principal. | Tool calls aparecem como etapas tipadas; o Tocaê ainda precisaria executar cada ferramenta localmente e devolver `function_result`. |
| Streaming | Chunks de conteúdo consumidos diretamente pelo adaptador atual. | Eventos SSE tipados com etapas; requer tradução para os eventos já esperados pelo renderer e testes de cancelamento. |
| Benefício para o Teco | Fluxo existente já satisfaz streaming, contexto local e ferramentas autorizadas. | Melhor observabilidade e formato mais estruturado; estado server-side não é necessário para o desenho atual. |

**Decisão:** manter `generateContentStream` por enquanto e não migrar nesta etapa. A Interactions API é suportada pelo SDK instalado e parece tecnicamente viável, mas a principal vantagem de gestão de histórico server-side conflita com a política atual de manter o histórico e seus limites no Tocaê. Preservar isso exigiria `store: false` e reenvio do histórico local, reduzindo esse benefício; usar `store: true` introduziria retenção de conversa no Google por padrão. O fluxo atual também já passou por smoke test real, enquanto a migração acrescentaria um novo formato de eventos, etapas de ferramentas e comportamento de cancelamento sem benefício funcional comprovado para o usuário.

Reavaliar a migração se o Teco precisar de observabilidade por etapa ou se a API atual deixar de atender. Antes disso, exigir teste de aceitação com `store: false`, streaming, tool call/result client-side, histórico local, cancelamento e compatibilidade dos modelos suportados. A configuração de armazenamento deve ser explícita; não depender do padrão `store: true`.

## 6. Segurança, privacidade e confiabilidade

Esta seção é uma avaliação estática baseada nos fluxos encontrados. Não foram realizadas exploração, chamadas a serviços externos nem testes de penetração.

### Riscos priorizados

| ID | Severidade | Achado e evidência | Impacto | Mitigação recomendada |
|---|---|---|---|---|
| R1 | Média | Consultas, respostas de ferramentas e metadados locais podem ser enviados ao provedor configurado. `get_playlist`/busca podem incluir caminhos locais; o provedor é externo quando Gemini/OpenAI ou um endpoint remoto é escolhido. | Exposição de nomes, caminhos e metadados da biblioteca/fila ao operador do serviço configurado. | Informar claramente antes do primeiro envio, documentar campos enviados, oferecer modo local e minimizar caminhos/atributos transmitidos. |
| R2 | Média | `ai-history.json` e `ai-library-index.json` são persistidos como JSON sem criptografia em `userData`; a credencial, ao contrário, usa `safeStorage`. | Usuário/processo com acesso ao perfil local pode ler histórico e metadados indexados. | Considerar criptografia compatível com a plataforma, retenção configurável, limpeza automática e explicação de privacidade. |
| R3 | Média | `validateConfig` aceita HTTP e HTTPS; HTTP é necessário para servidor local, mas uma URL remota HTTP pode transmitir credencial Bearer sem TLS pelo adaptador OpenAI-compatible. | Interceptação de chave/tráfego se o usuário configurar endpoint remoto sem TLS. | Permitir HTTP somente para loopback/local explicitamente reconhecido; exigir HTTPS para destinos remotos e exibir aviso para exceções. |
| R4 | Média | Não há limite explícito de tamanho de mensagem, tokens, requisições por período ou custo; histórico limita quantidade de mensagens, não o tamanho agregado. | Custo inesperado, excesso de contexto ou consumo de recursos por uso repetido/entradas grandes. | Definir limites de caracteres/tokens, truncamento/sumarização, quota configurável e estimativa de uso. |
| R5 | Baixa–média | A validação de emissor IPC assegura uma janela da aplicação, mas não restringe de forma granular a janela/frame/origem autorizada para cada método. | Aumenta impacto caso conteúdo não confiável seja carregado na janela principal ou futuramente sejam adicionadas janelas. | Restringir a origem/frame esperado, manter navegação remota bloqueada e adicionar teste de autorização IPC. |
| R6 | Baixa | Alguns efeitos do player podem ser acionados pelo modelo sem confirmação individual; a aplicação de proposta de playlist é confirmada. | Comando ambíguo pode mudar o estado de reprodução, embora o conjunto de ferramentas seja limitado e reversível. | Definir política explícita para confirmação por categoria de ação e mostrar a ação interpretada antes de executar quando ambígua. |
| R7 | Baixa | Cancelamento da conversa não é propagado à chamada de embedding usada pela busca semântica. | Trabalho/requisição de embedding pode continuar depois de o usuário cancelar. | Propagar o mesmo `AbortSignal` até embeddings e testar cancelamento durante tool call semântica. |

**Não foram identificadas evidências de vulnerabilidade crítica ou alta** nos fluxos examinados. Isso não equivale a garantia de ausência de vulnerabilidades: não foi feita análise dinâmica, fuzzing ou revisão independente de segurança.

### Limites da instrução de escopo

O prompt instrui o modelo a permanecer no contexto do Tocaê, mas prompt não é controle de acesso. Um modelo ainda pode responder fora de escopo ou interpretar incorretamente um pedido. A proteção verificável está no catálogo fechado de ferramentas e nas operações do processo principal. As ferramentas atuais não dão ao modelo acesso geral às configurações, filesystem ou execução de comandos.

### Dados acessíveis e dados fora do alcance direto

- **Acessíveis via ferramentas:** resultados de busca da biblioteca, fila atual, mídia/estado atual e operações básicas do player; uma proposta pode ser aplicada após confirmação.
- **Não acessíveis como ferramenta do Teco:** tela/configuração da aplicação, favoritos, histórico de reprodução, arquivos de áudio/vídeo/imagem em conteúdo integral e operações genéricas de filesystem.
- **Atenção à transmissão:** dados devolvidos por ferramentas ao modelo são enviados ao provedor selecionado para completar a conversa. O fato de uma função ser somente leitura não significa que seus dados não saiam do dispositivo.

## 7. Cobertura de testes observada

Executado durante a auditoria:

```text
ELECTRON_RUN_AS_NODE=1 ./node_modules/electron/dist/electron --test
45 testes passaram; 0 falharam.
```

Os 13 testes específicos de IA incluem descoberta de modelos Gemini (mock), instrução de sistema, fluxo de ferramenta Gemini (mock), histórico, cancelamento, adaptador OpenAI-compatible, busca/fila somente leitura e índice semântico. Os testes comprovam partes do comportamento local com dados controlados; **não comprovam** conectividade real, latência, comportamento de quota, preço, políticas de privacidade ou compatibilidade de cada modelo remoto.

## 8. Dívida documental

O trecho de IA do [README.md](../../README.md) não está totalmente alinhado à implementação:

- descreve Gemini como endpoint compatível com OpenAI, enquanto o código atual usa `@google/genai`;
- descreve três configurações/provedores, enquanto a configuração da aplicação inclui também OpenAI-compatible;
- declara recursos como envio, streaming, histórico, busca e proposta de playlist ainda “em desenvolvimento”, apesar de fluxos correspondentes estarem implementados;
- deve distinguir busca semântica por texto do item de entendimento semântico do conteúdo de áudio/vídeo/imagem.

Revisar o README é recomendado para evitar prometer capacidades inexistentes ou ocultar as disponíveis; não foi alterado como parte desta auditoria.

## 9. Roadmap recomendado

As prioridades refletem risco e dependências; itens concluídos posteriormente estão marcados.

### P0 — Segurança de dados e validação antes de ampliar o uso

1. **Explicitar o que sai do dispositivo.** Mostrar provedor/endpoint e categorias de dados enviados antes do primeiro pedido; documentar comportamento em modo local.
   - **Dependências:** nenhuma.
   - **Aceite:** UI e documentação explicam que texto da conversa e resultados de ferramentas vão ao endpoint configurado; usuário consegue cancelar e limpar histórico.
2. **Endurecer URLs e credenciais.** Exigir HTTPS para endpoint remoto, permitir HTTP apenas com aviso para localhost, e separar credenciais por provedor.
   - **Dependências:** decisão sobre compatibilidade com servidores locais/remotos existentes.
   - **Aceite:** testes cobrem HTTP local, HTTP remoto rejeitado/confirmado e ausência de envio de credencial antiga a outro provedor.
3. **Executar smoke test real do Gemini.** Testar descoberta de modelos, conversa em streaming, uma chamada de ferramenta e erro/cancelamento com chave de teste.
   - **Dependências:** chave autorizada e modelo disponível; não guardar segredo em código/log.
   - **Aceite:** roteiro reproduzível, resultado documentado sem registrar conteúdo/chave do usuário e verificação de `thoughtSignature` em tool call real quando suportado.

### P1 — Limites, cancelamento e robustez da base existente

1. **Limitar contexto e custo.** Limites de entrada, tamanho de respostas de ferramentas e histórico por tokens/bytes; apresentar falhas de persistência ao usuário.
   - **Dependências:** limites dos provedores/modelos suportados.
   - **Aceite:** testes com entrada/histórico acima do limite têm resultado previsível e mensagem clara; uso não cresce sem limite.
2. **Propagar cancelamento e definir política de retries.** Compartilhar `AbortSignal` com embeddings; retries limitados apenas para falhas transitórias e operações seguras.
   - **Dependências:** distinguir erros transitórios de erros permanentes.
   - **Aceite:** cancelar interrompe geração e embedding; retries têm limite/backoff e não repetem efeitos de player.
3. **Reavaliar a API Gemini de longo prazo (decisão atual: manter `generateContentStream`).** A comparação está registrada na seção 5; não migrar apenas por preferência de API enquanto o fluxo atual atender.
   - **Dependências para uma migração futura:** benefício funcional claro, política explícita para retenção (`store: false` ou consentimento informado para armazenamento) e compatibilidade dos modelos em uso.
   - **Aceite futuro:** teste equivalente de streaming, tool call/result client-side, histórico local, cancelamento, erros e limites; confirmar que nenhuma solicitação armazena interação por padrão inadvertidamente.
4. **Melhorar busca do catálogo (implementado no acompanhamento).** A ferramenta permite filtros estruturados de título/artista/álbum/gênero; a busca semântica continua baseada em nome/caminho/tipo.
   - **Dependência resolvida:** usa a extração local existente e ignora tags ausentes; filtros textuais normalizam caixa e diacríticos.
   - **Aceite atendido:** testes cobrem filtros de tags combinados, busca por título e correspondência sem acentos; campos ausentes não contam como correspondência.

### P2 — Personalização e curadoria

1. **Histórico e favoritos com consentimento (implementado no acompanhamento).** Leitura de favoritos e histórico local opt-in, separados do progresso de retomada.
   - **Dependências resolvidas:** controles independentes, retenção de 500 registros, armazenamento local sem caminhos absolutos e ação explícita de limpeza.
   - **Aceite atendido:** usuário pode consultar, apagar e desativar a coleta; ferramentas bloqueiam acesso sem autorização.
2. **Playlists persistentes e editáveis (implementado no acompanhamento).** Salvar a fila ou uma proposta do Teco como playlist nomeada e local.
   - **Dependências resolvidas:** armazenamento separado da fila atual, edição do nome/ordem/itens e confirmação antes de excluir.
   - **Aceite atendido:** salvar não substitui a fila; adicionar uma salva à fila é uma ação explícita de acréscimo.
3. **Recomendações explicáveis (implementado no acompanhamento).** Sugestões determinísticas locais a partir de favoritos e avaliações explícitas, sem uso do histórico de reprodução ou envio ao provedor.
   - **Dependências resolvidas:** opt-in independente, feedback de gostei/não tenho interesse, tags de artista/álbum/gênero e armazenamento local das avaliações.
   - **Aceite atendido:** cada recomendação explica o sinal e o item relacionado; as sugestões podem ser desativadas e as avaliações apagadas nas configurações.

### P3 — Capacidades multimodais e organização avançada

1. **Análise de áudio, imagem e vídeo (parcial).** Os fluxos analisam a mídia atual da fila com o Gemini.
   - **Resolvido neste passo:** opt-in independente, confirmação nativa a cada envio, formatos limitados, teto de 10 MiB, cancelamento e sem persistência do áudio/resultado no Tocaê.
   - **Resolvido neste passo:** descrição opt-in de imagem atual da fila, confirmação nativa por envio, JPEG/PNG/WebP até 10 MiB e resultado não persistido.
   - **Resolvido neste passo:** opt-in e confirmação por vídeo, extração local de até 8 quadros para vídeos de até 10 minutos, limite total de 8 MiB dos quadros enviados e nenhuma persistência do vídeo, quadros ou resultado.
   - **Pendente:** smoke tests reais de imagem/vídeo, testar formatos/modelos adicionais e revisar comportamento/retenção conforme políticas atualizadas do provedor.
2. **Organização de arquivos com pré-visualização e aplicação segura (parcial).**
   - **Resolvido neste passo:** opt-in independente, plano local limitado a 500 itens, organização de áudio por artista/álbum, pastas por tipo para vídeo/imagem, caminhos sanitizados, indicação de conflitos e aplicação após confirmação nativa.
   - **Proteções:** destinos existentes não são sobrescritos, itens já organizados/conflitantes são ignorados e os movimentos desta sessão podem ser desfeitos.
   - **Pendente:** renomeação personalizada e organização por gênero. O histórico local permite desfazer movimentos após reiniciar, desde que os destinos continuem válidos.
3. **Revisão e automação da documentação.**
   - **Dependências:** definição de capacidades realmente suportadas.
   - **Aceite:** README e interface distinguem suporte implementado, parcial e planejado; documentação de privacidade coincide com o comportamento real.

## 10. Arquivos principais examinados

- [core.ts](../../electron/ai/core.ts) — prompt, histórico em memória, timeout e fluxo de resposta.
- [provider.ts](../../electron/ai/provider.ts) — SDK Gemini, adaptador OpenAI-compatible, streaming, embeddings e tool calls.
- [recommendations.ts](../../electron/ai/recommendations.ts) — recomendações locais e persistência de feedback explícito.
- [organizationPlan.ts](../../electron/ai/organizationPlan.ts) — geração da prévia, aplicação confirmada, proteção contra sobrescrita e desfazer.
- [index.ts](../../electron/ai/index.ts) — configuração, credenciais, IPC e execução de ferramentas.
- [tracks.ts](../../electron/media/tracks.ts) — FFprobe e extração local de quadros de vídeo com limites de saída e cancelamento.
- [tools.ts](../../electron/ai/tools.ts) — catálogo e busca por nome, caminho, tags, favoritos e histórico recente.
- [historyStore.ts](../../electron/ai/historyStore.ts) e [semanticIndex.ts](../../electron/ai/semanticIndex.ts) — persistência local de histórico e índice.
- [AssistantPage.tsx](../../src/features/ai/AssistantPage.tsx) e [AiSection.tsx](../../src/features/settings/AiSection.tsx) — chat e configuração.
- [ai.test.mjs](../../electron/ai/ai.test.mjs) — testes do subsistema de IA.
- [organizationPlan.test.mjs](../../electron/ai/organizationPlan.test.mjs) — testes da prévia, aplicação, desfazer, conflitos e proteção contra sobrescrita.
- [windows.ts](../../electron/windows.ts), [preload.ts](../../electron/preload.ts) e [ipc.ts](../../shared/ipc.ts) — limites entre renderer e processo principal.
- [library.ts](../../electron/library.ts), [metadata.ts](../../electron/media/metadata.ts), [playlist.ts](../../electron/playlist.ts) e [playlistStore.ts](../../electron/playlistStore.ts) — catálogo, metadados e fila.
- [savedPlaylistStore.ts](../../electron/savedPlaylistStore.ts) e [savedPlaylists.ts](../../electron/savedPlaylists.ts) — persistência e IPC das playlists nomeadas.
- [SavedPlaylistsView.tsx](../../src/features/playlist/SavedPlaylistsView.tsx) — salvar, carregar para a fila, editar e excluir playlists persistidas.
- [listeningHistory.ts](../../electron/ai/listeningHistory.ts) — persistência local opt-in do histórico recente, limitada e sem caminhos absolutos.
- [playbackProgress.ts](../../src/features/player/playbackProgress.ts) e [favorites.ts](../../src/features/library/favorites.ts) — progresso e favoritos locais; o Teco só consulta favoritos com consentimento explícito.

## 11. Acompanhamento após a auditoria — 2026-11-20

As seguintes ações P0 foram implementadas após a avaliação original:

- **Aviso de privacidade antes do envio:** o chat informa que mensagens e dados da biblioteca/fila (nomes, caminhos e metadados) podem ser enviados ao provedor, identificando o provedor e endpoint.
- **Proteção de endpoints e credenciais:** URLs remotas HTTP são rejeitadas tanto ao salvar quanto ao carregar configuração; HTTP permanece permitido para loopback, necessário a servidores locais. Credenciais agora são cifradas e armazenadas por provedor, a chave legada é migrada para o provedor configurado, e Ollama nunca recebe uma chave antiga. Chamadas HTTP-compatible também não seguem redirecionamentos.
- **Limites P1 de contexto e custo:** entrada limitada a 8 KiB, contexto por envio a 48 KiB, histórico retido a 64 KiB/50 mensagens, resultados de ferramentas a 8 KiB cada e 16 KiB no total, cinco chamadas de ferramenta por pedido e resposta limitada a 2.048 tokens/16 KiB. Mensagens antigas são omitidas do contexto e o chat informa os limites.
- **Persistência do histórico:** erros de gravação agora são registrados e retornados à interface com uma mensagem explícita, distinguindo resposta gerada de histórico não salvo.
- **Cancelamento e retries P1:** o sinal de cancelamento da conversa chega à execução da ferramenta e aos embeddings semânticos, incluindo lotes de indexação. Somente embeddings são repetidos: até duas tentativas adicionais com espera crescente para erros de rede/HTTP transitórios; cancelamento e erros permanentes não são repetidos. Geração do chat não é repetida para evitar duplicar ferramentas com efeitos colaterais.
- **Smoke test Gemini real:** com autorização do usuário, a descoberta de modelos, streaming e uma chamada de ferramenta foram verificadas usando `gemini-3.1-flash-lite`. A ferramenta retornou estado simulado (`playing: false`, sem mídia atual); nenhum estado real do player ou conteúdo da biblioteca foi enviado. A chave não foi registrada em logs nem alterada.
- **Busca estruturada do catálogo:** `search_library` aceita filtros por título, artista, álbum e gênero, combináveis entre si e com tipo/nome/caminho. As tags são extraídas apenas quando esses filtros são usados, em lotes concorrentes limitados; a busca por nome/caminho não faz leituras extras de metadados. Correspondências por texto ignoram caixa e diacríticos.
- **Consentimento para favoritos e histórico:** acesso a favoritos e coleta de reprodução local têm controles independentes, ambos desativados por padrão. O histórico mantém até 500 inícios de áudio/vídeo locais com nome, tipo e horário, sem caminho absoluto; a ferramenta retorna até 20 registros. Os dados ficam no perfil local sem criptografia, e resultados só chegam ao provedor quando o Teco usa a ferramenta. Desativar a coleta interrompe novos registros, mas não apaga os existentes; há ação separada para apagá-los.
- **Playlists nomeadas:** o usuário pode salvar a fila atual ou uma proposta do Teco, editar nome/ordem/itens e acrescentar a playlist à fila sem substituí-la. Os dados ficam em `saved-playlists.json` no perfil local, incluindo caminhos absolutos necessários à reprodução; não são enviados ao provedor ao salvar. A exclusão exige confirmação.
- **Verificação de playlists, recomendações e análise de áudio:** os 4 testes do armazenamento de playlists passaram; o conjunto focado com playlists, fila e IA passou com 41/41 testes. Typecheck, lint CSS e build do Vite/Electron passaram.
- **Smoke test de áudio autorizado:** uma amostra local foi analisada pelo Gemini `gemini-3.1-flash-lite` após confirmação. O retorno incluiu estimativas de gênero, clima, energia, instrumentos e ritmo; nenhum caminho, nome do arquivo ou letra foi registrado. A saída não foi persistida pelo Tocaê e não é ground truth.
- **Verificação de favoritos, recomendações e áudio:** os 31 testes de IA fazem parte do conjunto focado aprovado e cobrem consentimento, limites locais, feedback, envio de áudio fixture em mock e cancelamento.
- **Verificação da busca estruturada:** 26 testes específicos de IA passaram e o typecheck do projeto passou.
- **Verificação local:** 58 testes passaram, junto com typecheck, lint CSS e build do Vite/Electron.
- **Verificação da descrição de imagem:** o conjunto focado de IA passou com 32/32 testes; typecheck, lint CSS e build Vite/Electron passaram. O teste de imagem usa Gemini mockado; nenhuma imagem real foi enviada ao provedor.
- **Verificação da análise de vídeo:** os 71 testes do projeto passaram, junto com typecheck, lint CSS e build Vite/Electron. O provider usa quadros mockados; FFmpeg/FFprobe extraíram com sucesso um quadro JPEG de um vídeo sintético local. Nenhum vídeo real foi enviado ao provedor.
- **Prévia de organização de arquivos:** opt-in independente e plano local limitado a 500 itens; testes verificam destinos por metadados/tipo, sanitização, itens já organizados, conflitos existentes/duplicados e truncamento.
- **Aplicação segura da organização:** confirmações nativas movem somente itens prontos, nunca sobrescrevem destinos existentes e oferecem desfazer as movimentações concluídas, inclusive após reiniciar.
- **Verificação atual:** 77 testes passaram; typecheck, lint CSS e build de produção Vite/Electron passaram. O build manteve apenas o aviso de depreciação existente do `inlineDynamicImports`.

O aviso de privacidade da conversa informa o usuário, mas não pede confirmação a cada envio. Os consentimentos de favoritos e histórico são controles separados nas configurações. O smoke test comprova um fluxo real com a conta/modelo testado, não disponibilidade contínua, latência ou compatibilidade de todos os modelos Gemini; a chamada pode ter consumido quota.
