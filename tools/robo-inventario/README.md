# Atualização pontual da Omnibees

## Chrome normal · ajuste assistido de uma noite

Em `chrome://extensions`, use **Carregar sem compactação** no modo do desenvolvedor e selecione a pasta `tools/extensao-inventario` deste projeto. Abra o Portal e a Omnibees no mesmo perfil do Chrome.

1. Em **Comercial → Atualizações de inventário**, selecione a mesma data nos dois campos, revise a prévia e clique em **Confirmar para ajuste no Chrome normal**.
2. Ainda na aba do Portal, abra a extensão **Inventário Sueds** e clique em **Carregar pedido desta aba**. Mantenha a aba do Portal aberta.
3. Na Omnibees, abra a tela **Inventário** do hotel, filtre a noite e salve os **Ocupados** indicados no painel.
4. Com a grade visível, clique em **Conferir grade e dar baixa** na extensão. Se houver divergência, corrija a grade e repita a conferência do mesmo pedido. A baixa registra uma noite conferida no Portal.

Um pedido de uma noite que ainda aguarda o robô dedicado pode ser transferido pelo botão **Ajustar este pedido no Chrome normal** no andamento. Ao reabrir o módulo em uma nova aba, o Portal recupera o ajuste assistido pendente mais recente do administrador.

## Chrome dedicado

Abra Iniciar.cmd no notebook e entre na Omnibees e no Portal como administrador no Chrome do robô. O perfil do Chrome fica no diretório local do usuário, fora do repositório. Deixe o notebook e esse Chrome ligados durante o envio. O menu Comercial → Atualizações de inventário pode ser usado no navegador habitual.

Selecione hotel e período e gere a prévia. A fonte é a captura diária já armazenada no Portal. O Portal guarda a prévia do administrador e a confirmação enfileira essa mesma posição. Cada linha oferta a parte inteira de 80% do saldo da categoria e lança a capacidade menos essa oferta no campo Ocupados. Consulte a data da captura na tabela antes de confirmar. Trancoso e Casas ficam disponíveis para consulta até a conclusão de seus mapeamentos.

O robô processa um pedido por vez, confere o hotel, a data e as capacidades e verifica o saldo na grade após gravar cada categoria. Um envio interrompido pode ter gravado parte da última noite. A página informa a última noite e a quantidade de noites inteiras conferidas. Confira a grade e gere uma nova prévia para retomar. O robô pula saldos que já correspondem ao pedido. A execução diária continua desligada.
