# Destino das vendas desde setembro de 2026

Planilha: `1Tcy3kerwSt8yrYTmQorAsHM4mUBQUKFGKcl1BLi4LW0`.
Data de corte: Data Venda >= 01/09/2026. Agosto e meses anteriores mantêm localização e histórico.

## Captura DeskHotel / dash.chatbooking.com.br

Leia a coluna ORIGEM da reserva, incluindo todas as unidades e os status solicitados. Não use apenas o nome do vendedor. Sem origem verificável, não grave a reserva com canal vazio; registre pendência para conferência.

| Origem | Aba | Canal | Vendedor | Fonte S |
|---|---|---|---|---|
| Depto_Reservas - nome | Lancamento_Vendas | CENTRAL DE RESERVAS | Nome do vendedor | DESKHOTEL |
| Alice ou Alice (Assistente Virtual) | teste lancamento_vendas | Robo | Alice (Robo) | DESKHOTEL |
| Depto_Reservas - Loja online | teste lancamento_vendas | SITE | vazio | DESKHOTEL |
| Depto_Reservas sem nome de vendedor | teste lancamento_vendas | CENTRAL DE RESERVAS | vazio | DESKHOTEL |
| Site do Hotel / Site_Estabelecimento | teste lancamento_vendas | SITE | vazio | DESKHOTEL |
| AirBNB | teste lancamento_vendas | Airbnb | vazio | DESKHOTEL |
| BookingCom / Booking / Booking.com | teste lancamento_vendas | Booking | vazio | DESKHOTEL |
| Decolar | teste lancamento_vendas | Decolar | vazio | DESKHOTEL |
| Expedia | teste lancamento_vendas | Expedia | vazio | DESKHOTEL |
| Qualquer outra origem | teste lancamento_vendas | Origem identificada | vazio | DESKHOTEL |

BE MOBILE, BE MOBILLE, BOOKING ENGINE e SITE ficam somente em teste lancamento_vendas desde setembro. Na Omnibees, Fonte continua OMNIBEES.

Juniper/Azul Viagens também fica exclusivamente em `teste lancamento_vendas`: Canal `Azul Viagens`, Vendedor vazio, Fonte `JUNIPER` e Status `Confirmada` somente para linhas exportadas com `Estado línea reserva = OK`. Prefixe o localizador no Código Reserva como `JUNIPER-<localizador>` para manter as duas origens independentes e permitir que Omnibees e Juniper sejam somadas sem colisão. A Fonte diferencia as linhas: o portal exibe `Azul Viagens`, `Azul Viagens (Via Juniper)` e a linha-resumo `Azul Viagens Total`. Agosto de 2026 permanece nos totais manuais existentes; linhas detalhadas Juniper substituem o fallback manual quando existirem para evitar soma dupla.

Exceção expressa do usuário: `CR29070361669` (Kissyla Brandão, SUEDS PLAZA), com origem observada `Site_Estabelecimento - Amanda Sales Melgaço`, fica em `Lancamento_Vendas` com Canal `SITE` e Vendedor `Amanda Melgaco`, contando para Amanda. Não generalizar essa exceção a outras vendas do Site. O nome visível `Amanda Sales Melgaço` corresponde à opção `Amanda Melgaco` do combo de vendedores.

Para origem `Depto_Reservas - Loja online`, selecionar Hotel `SUEDS EXPERIENCIAS` no combo, independentemente do passeio/transfer descrito na acomodação. Essa origem não identifica vendedor humano.

Robo: Forma Pagto = Cartao credito. Para confirmadas do Site/Robo, Recebido = Valor Total e A Receber = 0. Para Airbnb e demais OTAs, preserve o pagamento constatado; não invente forma de pagamento.

## Status da aba dos vendedores — correção de 11/09/2026

Em `Lancamento_Vendas`, automações só podem gravar `Confirmada`, `Pendente` ou `Cancelada` em R. `Alterada` na origem não define a situação comercial: não grave esse valor nem o converta automaticamente em outro status; mantenha o valor existente e registre pendência. Preserve outros valores históricos/manuais fora do escopo da execução.

No DeskHotel, `Bloqueada`/`Bloqueado` entra como `Pendente` na planilha; depois, só atualize R quando o vendedor alterar o status na origem e a nova situação for verificada. Não transforme esse bloqueio em venda confirmada por passagem de tempo.

A rotina Omnibees consulta ambas as abas para deduplicação, mas não modifica R de `Lancamento_Vendas`, inclusive linhas de vendedores com Fonte vazia e histórico de julho/agosto. Sua reconciliação permanece em `teste lancamento_vendas`, somente no mês vigente e nas origens elegíveis. Isso não autoriza mudar os status brutos já existentes nessa segunda aba.

Restaurações solicitadas pelo usuário devem usar o histórico de cada célula/chave e plano auditável, sem restauração integral de versão. Para `operation: "status-update"`, valide a linha existente e preserve sua aba e classificação; não aplique regras de inserção/migração a uma correção isolada de R. Use `rowNumber`, `previousStatus`, `status`, `evidence` e os campos de identidade/classificação da leitura atual. Células diferentes de uma chave histórica duplicada são validadas separadamente.

Deduplicar por Codigo Reserva + Hotel em ambas as abas. Releia antes de escrever e verifique depois. Não regrave a linha inteira com campos vazios sobre classificações existentes. Não mova registros sem confirmar a cópia na aba correta. Preserve observações, dados de hóspedes, datas, fórmulas e colunas adicionais.

## Validação obrigatória antes da escrita

Antes de qualquer escrita por Codex, prepare JSON com `records` (todas as inclusões e atualizações, incluindo status; cada venda com codigo, hotel, dataVenda, canal, vendedor, fonte, formaPagamento, status e targetSheet; novas capturas DeskHotel também com origin observada), `existingSellers` e `existingChannels` (registros atuais das duas abas com rowNumber e status). Execute `node tools/validate_sales_write.cjs <plano.json>` neste projeto. Para correções de status, inclua também os `requests` updateCells reais, limitados a R e `fields: userEnteredValue`; a validação confere correspondência exata entre células, plano e valores. Valide inclusões e status em lotes separados. Se falhar, não grave. Um lote de inclusões validado não autoriza status fora desse plano. Guarde cada plano antes da escrita em arquivo com timestamp; a conferência posterior usa outro arquivo e nunca sobrescreve a evidência anterior.

Consulte as duas abas, mesmo quando o pedido citar só Lancamento_Vendas. Se uma chave já existir em teste lancamento_vendas, atualize a linha existente ali. Ausência na aba dos vendedores não significa reserva nova. Desde setembro, uma venda sem vendedor humano identificado não pode ser inserida na aba dos vendedores. Preserve Fonte, Canal, Vendedor e pagamento existentes durante atualização de status; reconcilie o status na aba que contém a reserva. Nunca use status de uma captura anterior para reativar uma reserva.

## Portal

A localização física não define a categoria contábil. `dashboardSources` combina Site/Robo de teste lancamento_vendas com vendedores. Robo continua fora da Equipe; Site permanece no canal Site. OTAs como Airbnb ficam em Outros Canais. Deduplicação entre abas evita soma dupla durante migração. Asksuite permanece histórico até agosto.

Nas linhas de Fonte `OMNIBEES`, os status `Confirmada` e `Alterada` compõem vendas na Data Venda original. `Alterada` continua com seu status bruto e não é convertida em `Confirmada`. `Cancelada` não compõe vendas. Essa regra não autoriza qualquer alteração na aba `Lancamento_Vendas`.
## Regra autorizada em 17/09/2026 — prevalece sobre as restrições anteriores

Se a origem DeskHotel identificar um vendedor humano pelo nome, considerar venda desse vendedor em `Lancamento_Vendas`, inclusive `Motor - nome` e `Site_Estabelecimento - nome`. Motor humano usa Canal `CENTRAL DE RESERVAS`; Site humano mantém `SITE`. Normalizar Amanda Sales Melgaço para Amanda Melgaco. Alice continua Robo, e Loja online/nomes de canais não são vendedores humanos. Não inferir vendedor a partir do hóspede. Histórico até agosto permanece preservado.

O usuário autorizou corrigir os registros de setembro já roteados para canais. Migrar a chave existente: copiar com campos manuais, validar e confirmar o destino antes de limpar somente os valores da linha de origem; nunca deixar duplicata. Status e recebimentos permanecem os existentes. A automação permanece pausada.
