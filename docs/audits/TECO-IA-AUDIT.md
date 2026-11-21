# Auditoria técnica do Teco IA

**Data:** 2026-03-19  
**Escopo:** implementação existente no repositório, com foco na integração de IA do Tocaê.  
**Tipo:** auditoria documental baseada em código e testes; não é teste de penetração nem validação com serviços externos.

## 1. Resumo executivo

O Teco é um assistente conversacional funcional, integrado ao processo principal do Electron e aos dados de reprodução do Tocaê. A integração inclui streaming, histórico de uma conversa, provedores configuráveis, ferramentas limitadas para consultar a biblioteca e a fila, controles básicos do player e propostas de playlist que exigem confirmação antes de substituir a fila.

O Gemini usa o SDK oficial `@google/genai`, incluindo geração em streaming, descoberta de modelos, embeddings e chamadas de ferramentas. O fluxo mantém as partes originais do modelo necessárias para preservar `thoughtSignature`. O uso do SDK não significa que a Interactions API esteja integrada: a implementação atual usa `models.generateContentStream` e um ciclo manual de ferramentas, com até cinco turnos. Não foi feita chamada real ao Gemini nesta auditoria.

**Resultado da matriz de 80 critérios:**

| Estado | Quantidade | Definição |
|---|---:|---|
| Implementado | 17 (21,25%) | Fluxo funcional identificado no código; as limitações estão registradas quando relevantes. |
| Parcial | 14 (17,5%) | Há uma versão limitada, mas faltam partes relevantes do comportamento esperado. |
| Não implementado | 49 (61,25%) | Não foi encontrado fluxo integrado do Teco para o critério. |
| Apenas interface / estrutura preparada | 0 | Não foi identificado critério cujo único suporte seja uma tela ou estrutura sem fluxo funcional. |

O resultado não deve ser interpretado como percentual de qualidade ou prontidão: cada critério tem peso igual, e a classificação “parcial” não mede profundidade.

### Indicadores estimados

Para a matriz geral, atribuir 1 ponto a “implementado”, 0,5 a “parcial” e 0 a “não implementado” resulta em **30%** (24/80). Os indicadores por área abaixo são estimativas de completude funcional, não métricas observadas em produção.

| Área | Estimativa | Base |
|---|---:|---|
| Conversação e interface | 75–81% | Chat, streaming, provedores, ferramentas e fluxo principal existentes; contexto, sessões, persistência e cancelamento ainda limitados. |
| Infraestrutura de IA | 70–80% | Separação Main/Preload/Renderer, adaptadores, IPC tipado e armazenamento seguro de credenciais; faltam limites de uso e validação real dos provedores. |
| Busca da biblioteca | ~35% | Busca lexical, semântica e filtro por tipo existem; metadados ricos e atributos como artista, álbum e gênero não fazem parte da busca. |
| Playlists | ~38% | O Teco propõe uma seleção a partir da biblioteca e, com confirmação, substitui a fila atual; não cria playlists nomeadas nem aplica preferências musicais. |
| Controle do player | ~80% dos controles básicos | Play, pause, próximo e anterior estão disponíveis; volume e navegação da aplicação não estão expostos ao agente. |
| Organização, recomendações, inteligência musical, vídeo e imagem | 0% | Nenhum fluxo de IA correspondente foi encontrado. |

**Conclusão:** a base de conversa e integração é real, mas o Teco ainda não é um sistema de curadoria musical, organização automática ou análise multimodal. Os maiores riscos práticos são privacidade dos dados enviados ao provedor, arquivos locais de histórico/índice sem criptografia, limites insuficientes de contexto/custo e ausência de validação ao vivo do Gemini.

## 2. Matriz consolidada dos 80 critérios

Legenda: **I** = implementado; **P** = parcial; **N** = não implementado.

| Grupo | I | P | N |
|---|---:|---:|---:|
| A. Conversação e interface | 8 | 5 | 0 |
| B. Busca da biblioteca | 1 | 5 | 4 |
| C. Playlists | 2 | 2 | 4 |
| D. Organização de arquivos | 0 | 0 | 8 |
| E. Histórico de reprodução e favoritos | 0 | 0 | 6 |
| F. Recomendações | 0 | 0 | 6 |
| G. Inteligência musical | 0 | 0 | 7 |
| H. Análise de vídeo | 0 | 0 | 5 |
| I. Análise de imagem | 0 | 0 | 6 |
| J. Integração e ações | 6 | 2 | 3 |
| **Total** | **17** | **14** | **49** |

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
| B3 | Busca por título | P | [tools.ts](../../electron/ai/tools.ts) pesquisa nome/caminho; não usa título extraído de tags como campo independente. |
| B4 | Busca por artista | N | O extrator de metadados pode obter campos de mídia, mas a busca exposta ao Teco não pesquisa a biblioteca por artista. |
| B5 | Busca por álbum | N | Não há ferramenta ou índice de busca por álbum. |
| B6 | Busca por gênero | N | Não há ferramenta ou índice de busca por gênero. |
| B7 | Filtro por tipo de mídia | I | A busca aceita filtro por tipo, incluindo áudio/vídeo/imagem, limitado aos itens registrados na biblioteca. |
| B8 | Resposta contextual sobre resultados | P | O modelo pode explicar os resultados retornados pela ferramenta; os resultados têm contexto limitado e não existe ranking/racionalização musical abrangente. |
| B9 | Filtros e refinamento | P | Há filtro de tipo e limite de resultados, mas não filtros combináveis por artista, álbum, duração, gênero ou outros metadados. |
| B10 | Recomendar itens relacionados na biblioteca | N | Similaridade textual/semântica da busca não equivale a uma recomendação integrada de itens relacionados ou baseada no gosto do usuário. |

### C. Playlists

| # | Critério | Estado | Evidência e comportamento / limitação |
|---|---|---|---|
| C1 | Criar playlist | P | `propose_playlist` monta uma proposta temporária; não cria nem persiste uma playlist nomeada. |
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
| D1 | Criar pastas automaticamente | N | Não há ferramenta de filesystem para organização ou criação de diretórios. |
| D2 | Mover arquivos automaticamente | N | O agente não expõe operação de movimentação de arquivos. |
| D3 | Renomear arquivos | N | Não há ferramenta de renomeação. |
| D4 | Organizar por artista | N | A organização por metadados não está integrada ao agente. |
| D5 | Organizar por álbum | N | A organização por metadados não está integrada ao agente. |
| D6 | Organizar por gênero | N | A organização por metadados não está integrada ao agente. |
| D7 | Detectar duplicatas e agir sobre elas | N | Não há análise de duplicatas nem fluxo de ação correspondente. |
| D8 | Pré-visualizar e confirmar operações de organização | N | A confirmação de playlist não se estende a ações de filesystem, que não estão implementadas. |

### E. Histórico de reprodução e favoritos

| # | Critério | Estado | Evidência e comportamento / limitação |
|---|---|---|---|
| E1 | Histórico de reprodução acessível ao Teco | N | O progresso de mídia é salvo localmente em [playbackProgress.ts](../../src/features/player/playbackProgress.ts), mas não constitui histórico de reprodução nem é exposto ao agente. |
| E2 | Registrar itens ouvidos recentemente | N | Não foi encontrada coleta de eventos de reprodução para o Teco. |
| E3 | Consultar frequência/duração de reprodução | N | Não existe armazenamento ou ferramenta analítica de sessões de escuta. |
| E4 | Ler favoritos existentes | N | Favoritos são armazenados pelo renderer em [favorites.ts](../../src/features/library/favorites.ts), sem ferramenta de leitura para o Teco. |
| E5 | Adicionar/remover favoritos por conversa | N | Não há ferramenta autorizada de mutação de favoritos. |
| E6 | Usar histórico/favoritos para personalização | N | Não há conexão entre esses dados e o contexto de recomendação do agente. |

### F. Recomendações

| # | Critério | Estado | Evidência e comportamento / limitação |
|---|---|---|---|
| F1 | Recomendar músicas personalizadas | N | A busca e proposta de fila não mantêm perfil do usuário nem histórico de preferências. |
| F2 | Recomendar artistas | N | Não há recomendador de artistas. |
| F3 | Recomendar álbuns | N | Não há recomendador de álbuns. |
| F4 | Recomendar conteúdo semelhante | N | Busca semântica sobre nomes/caminhos não analisa similaridade sonora nem gera recomendações personalizadas. |
| F5 | Aprender com feedback/curtidas | N | Não há coleta ou atualização de preferências do Teco. |
| F6 | Explicar recomendações com sinais do usuário | N | Não há recomendações nem trilha de sinais de preferência para explicar. |

### G. Inteligência musical

| # | Critério | Estado | Evidência e comportamento / limitação |
|---|---|---|---|
| G1 | Reconhecer humor/energia a partir do áudio | N | Não há análise de áudio por IA. |
| G2 | Reconhecer BPM/ritmo | N | Não há análise de BPM ou ritmo integrada ao Teco. |
| G3 | Reconhecer instrumentos | N | Não há classificação de instrumentos. |
| G4 | Transcrever ou entender letras | N | Não há transcrição nem análise de letras. |
| G5 | Detectar segmentos/estrutura da faixa | N | Não há análise de estrutura musical. |
| G6 | Classificar ou enriquecer tags automaticamente | N | Extração local de metadados não é classificação musical por IA nem grava tags. |
| G7 | Usar análise musical para busca/recomendação | N | As ferramentas não consomem características sonoras. |

### H. Análise de vídeo

| # | Critério | Estado | Evidência e comportamento / limitação |
|---|---|---|---|
| H1 | Resumir o conteúdo de um vídeo | N | O Teco não recebe conteúdo/quadros de vídeo para análise. |
| H2 | Gerar ou consultar transcrição/legendas | N | Não há pipeline de transcrição de vídeo integrado. |
| H3 | Pesquisar dentro de um vídeo | N | Não há indexação temporal de cenas ou fala. |
| H4 | Identificar cenas/objetos em vídeo | N | Não há análise visual de vídeo. |
| H5 | Criar capítulos ou timestamps com IA | N | Não há geração de capítulos/timestamps. |

### I. Análise de imagem

| # | Critério | Estado | Evidência e comportamento / limitação |
|---|---|---|---|
| I1 | Descrever imagens da biblioteca | N | A busca pode listar itens por tipo, mas não envia pixels de imagem ao modelo para descrição. |
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
| SDK | `@google/genai` no [provider.ts](../../electron/ai/provider.ts) | O pacote está no projeto; não foi feito teste real de rede/chave nesta auditoria. |
| Geração | `models.generateContentStream` | Não usa `Interactions API`. |
| Instrução do sistema | `systemInstruction` separada do histórico | O escopo é orientação para o modelo, não uma barreira de autorização; a barreira efetiva são as ferramentas disponíveis. |
| Chamada de ferramentas | Declarações Gemini e loop limitado no adaptador | Até cinco turnos de ferramenta; não há validação real de todos os modelos listados com `function calling`. |
| `thoughtSignature` | Partes originais do modelo são preservadas ao continuar a conversa | Há teste de regressão mockado; não substitui validação contra a API. |
| Modelos | Lista remota filtrada para capacidades de geração | Depende de chave válida, disponibilidade da API e modelos devolvidos pela conta/região. |
| Embeddings | `models.embedContent`, usado pelo índice semântico | O índice contém apenas nome/caminho/tipo; cálculo pode continuar após cancelar a conversa. |
| Erros e limites | Erros são normalizados no processo principal; timeout para conversa | Sem validação de latência, limites de quota, retry/backoff ou custos em conta real. |

**Conclusão Gemini:** a migração ao SDK oficial está implementada no código e coberta por testes mockados. Não há evidência nesta auditoria de um teste de aceitação com chave real. A adoção da Interactions API é uma decisão/migração futura, não uma descrição da arquitetura atual.

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

As prioridades refletem risco e dependências. Nenhum item abaixo foi implementado nesta auditoria.

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
3. **Decidir e testar a API Gemini de longo prazo.** Comparar manter `generateContentStream` com migrar para Interactions API antes de mudar o fluxo.
   - **Dependências:** requisitos de ferramentas, streaming, SDK e compatibilidade de modelos.
   - **Aceite:** decisão arquitetural com teste de aceitação equivalente de streaming, tool call, histórico e cancelamento.
4. **Melhorar busca do catálogo.** Indexar tags confiáveis como título/artista/álbum/gênero e permitir filtros estruturados.
   - **Dependências:** normalização dos metadados e comportamento para tags ausentes/contraditórias.
   - **Aceite:** testes de busca por cada campo com resultados ordenados e sem confundir texto do caminho com metadado.

### P2 — Personalização e curadoria

1. **Histórico e favoritos com consentimento.** Expor leitura ao agente sem misturar progresso de retomada com histórico de escuta.
   - **Dependências:** política de privacidade, retenção e armazenamento.
   - **Aceite:** usuário pode consultar, apagar e desativar a coleta; as ferramentas respeitam essas preferências.
2. **Playlists persistentes e editáveis.** Criar nome, revisar itens/ordem, editar e salvar sem substituir a fila implicitamente.
   - **Dependências:** modelo de dados de playlists e UX de confirmação.
   - **Aceite:** ações de salvar/aplicar são separadas, reversíveis quando possível e cobertas por testes.
3. **Recomendações explicáveis.** Introduzir sinais explícitos do usuário antes de personalização automática.
   - **Dependências:** histórico/favoritos consentidos e mecanismo de feedback.
   - **Aceite:** recomendações indicam os sinais usados e podem ser desativadas/limpas.

### P3 — Capacidades multimodais e organização avançada

1. **Análise de áudio, imagem e vídeo**, começando por um caso de uso único e opcional, sem enviar mídia sem consentimento.
   - **Dependências:** avaliação de custo, formatos/tamanho, política de retenção e seleção de provedor.
   - **Aceite:** processamento tem limites, aviso de transmissão, cancelamento e testes com amostras locais autorizadas.
2. **Organização de arquivos com pré-visualização.**
   - **Dependências:** operações de filesystem, recuperação/undo e consentimento explícito.
   - **Aceite:** nenhuma mutação ocorre sem plano legível e confirmação; erros parciais não são apresentados como sucesso.
3. **Revisão e automação da documentação.**
   - **Dependências:** definição de capacidades realmente suportadas.
   - **Aceite:** README e interface distinguem suporte implementado, parcial e planejado; documentação de privacidade coincide com o comportamento real.

## 10. Arquivos principais examinados

- [core.ts](../../electron/ai/core.ts) — prompt, histórico em memória, timeout e fluxo de resposta.
- [provider.ts](../../electron/ai/provider.ts) — SDK Gemini, adaptador OpenAI-compatible, streaming, embeddings e tool calls.
- [index.ts](../../electron/ai/index.ts) — configuração, credenciais, IPC e execução de ferramentas.
- [tools.ts](../../electron/ai/tools.ts) — catálogo e busca lexical.
- [historyStore.ts](../../electron/ai/historyStore.ts) e [semanticIndex.ts](../../electron/ai/semanticIndex.ts) — persistência local de histórico e índice.
- [AssistantPage.tsx](../../src/features/ai/AssistantPage.tsx) e [AiSection.tsx](../../src/features/settings/AiSection.tsx) — chat e configuração.
- [ai.test.mjs](../../electron/ai/ai.test.mjs) — testes do subsistema de IA.
- [windows.ts](../../electron/windows.ts), [preload.ts](../../electron/preload.ts) e [ipc.ts](../../shared/ipc.ts) — limites entre renderer e processo principal.
- [library.ts](../../electron/library.ts), [metadata.ts](../../electron/media/metadata.ts), [playlist.ts](../../electron/playlist.ts) e [playlistStore.ts](../../electron/playlistStore.ts) — catálogo, metadados e fila.
- [playbackProgress.ts](../../src/features/player/playbackProgress.ts) e [favorites.ts](../../src/features/library/favorites.ts) — estado local do player não integrado ao Teco.

## 11. Acompanhamento após a auditoria — 2026-11-20

As seguintes ações P0 foram implementadas após a avaliação original:

- **Aviso de privacidade antes do envio:** o chat informa que mensagens e dados da biblioteca/fila (nomes, caminhos e metadados) podem ser enviados ao provedor, identificando o provedor e endpoint.
- **Proteção de endpoints e credenciais:** URLs remotas HTTP são rejeitadas tanto ao salvar quanto ao carregar configuração; HTTP permanece permitido para loopback, necessário a servidores locais. Credenciais agora são cifradas e armazenadas por provedor, a chave legada é migrada para o provedor configurado, e Ollama nunca recebe uma chave antiga. Chamadas HTTP-compatible também não seguem redirecionamentos.
- **Limites P1 de contexto e custo:** entrada limitada a 8 KiB, contexto por envio a 48 KiB, histórico retido a 64 KiB/50 mensagens, resultados de ferramentas a 8 KiB cada e 16 KiB no total, cinco chamadas de ferramenta por pedido e resposta limitada a 2.048 tokens/16 KiB. Mensagens antigas são omitidas do contexto e o chat informa os limites.
- **Persistência do histórico:** erros de gravação agora são registrados e retornados à interface com uma mensagem explícita, distinguindo resposta gerada de histórico não salvo.
- **Cancelamento e retries P1:** o sinal de cancelamento da conversa chega à execução da ferramenta e aos embeddings semânticos, incluindo lotes de indexação. Somente embeddings são repetidos: até duas tentativas adicionais com espera crescente para erros de rede/HTTP transitórios; cancelamento e erros permanentes não são repetidos. Geração do chat não é repetida para evitar duplicar ferramentas com efeitos colaterais.
- **Smoke test Gemini real:** com autorização do usuário, a descoberta de modelos, streaming e uma chamada de ferramenta foram verificadas usando `gemini-3.1-flash-lite`. A ferramenta retornou estado simulado (`playing: false`, sem mídia atual); nenhum estado real do player ou conteúdo da biblioteca foi enviado. A chave não foi registrada em logs nem alterada.
- **Verificação local:** 58 testes passaram, junto com typecheck, lint CSS e build do Vite/Electron.

O aviso de privacidade informa o usuário, mas não é um consentimento explícito por solicitação. O smoke test comprova um fluxo real com a conta/modelo testado, não disponibilidade contínua, latência ou compatibilidade de todos os modelos Gemini; a chamada pode ter consumido quota.
