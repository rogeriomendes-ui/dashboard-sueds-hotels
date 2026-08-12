window.SUEDS_MANUAL_MODULES = [
  {
    "id": "recepcao-reservas",
    "code": "MÓDULO 01",
    "shortTitle": "Recepção e Reservas",
    "title": "Recepção e Reservas",
    "description": "Consulte apartamentos, localize reservas e acompanhe entradas, saídas e ocupação.",
    "activities": [
      {
        "id": "selecionar-hotel",
        "title": "Selecionar o hotel correto",
        "summary": "Garanta que todas as consultas e operações sejam feitas na unidade certa.",
        "steps": [
          "Confira o nome do hotel no topo da tela.",
          "Abra o seletor de empresa quando precisar trocar de unidade.",
          "Depois da troca, confirme novamente o nome exibido antes de continuar."
        ],
        "attention": "Uma operação realizada na empresa errada pode afetar reservas, valores e relatórios de outra unidade."
      },
      {
        "id": "mapa-recepcao",
        "title": "Consultar o mapa da Recepção",
        "summary": "Visualize apartamentos livres, ocupados, bloqueados ou em manutenção.",
        "steps": [
          "Acesse Hotel e selecione Recepção.",
          "Confira a data-base.",
          "Use os filtros de situação.",
          "Localize o apartamento e leia todos os indicadores antes de agir."
        ],
        "image": "/treinamentos-assets/recepcao-mapa-apartamentos.png",
        "imageAlt": "Mapa de apartamentos da Recepção"
      },
      {
        "id": "consultar-reservas",
        "title": "Consultar reservas",
        "summary": "Localize uma reserva por período e critério de consulta.",
        "steps": [
          "Acesse Hotel e selecione Reservas.",
          "Informe data inicial e final.",
          "Escolha Ocupação ou Venda conforme o objetivo.",
          "Clique em Consultar e confira titular, número, entrada, saída e status."
        ],
        "attention": "Não informe dados da reserva sem confirmar a identidade e a autorização do solicitante.",
        "image": "/treinamentos-assets/reservas-filtros-e-acoes.png",
        "imageAlt": "Filtros e ações da consulta de Reservas"
      },
      {
        "id": "localizar-reserva",
        "title": "Localizar uma reserva específica",
        "summary": "Use nome, número ou localizador e evite registros duplicados.",
        "steps": [
          "Selecione Localizar.",
          "Informe a chave disponível.",
          "Compare hotel, período, titular e localizador.",
          "Abra somente o registro correspondente."
        ],
        "attention": "Não crie outra reserva antes de confirmar que a original realmente não existe."
      },
      {
        "id": "proteger-dados-hospede",
        "title": "Proteger os dados do hóspede",
        "summary": "Aplique cuidados de privacidade durante todo o atendimento.",
        "steps": [
          "Evite falar documentos e contatos em voz alta.",
          "Não fotografe telas com dados pessoais.",
          "Compartilhe informações somente em canais autorizados.",
          "Bloqueie a tela ao se afastar do computador."
        ]
      }
    ]
  },
  {
    "id": "governanca-grupos",
    "code": "MÓDULO 02",
    "shortTitle": "Governança e Grupos",
    "title": "Governança e Grupos",
    "description": "Acompanhe situações dos apartamentos, solicitações, bloqueios e reservas de grupos.",
    "activities": [
      {
        "id": "filtros-governanca",
        "title": "Consultar a Governança",
        "summary": "Organize apartamentos por check-in, check-out, ocupados ou visão completa.",
        "steps": [
          "Acesse Hotel e selecione Governança.",
          "Confira a data-base.",
          "Escolha o filtro desejado.",
          "Compare apartamento, status, entrada, saída e pensão."
        ],
        "image": "/treinamentos-assets/governanca-filtros-status.png",
        "imageAlt": "Filtros da tela de Governança"
      },
      {
        "id": "ordem-servico",
        "title": "Acompanhar solicitações e O.S.",
        "summary": "Consulte demandas de atendimento, limpeza ou manutenção.",
        "steps": [
          "Localize o apartamento.",
          "Leia a descrição completa.",
          "Confirme o setor responsável.",
          "Atualize a conclusão somente após a execução real do serviço."
        ],
        "attention": "Em caso de divergência, comunique a Recepção antes de alterar a situação."
      },
      {
        "id": "bloquear-apartamento",
        "title": "Bloquear um apartamento",
        "summary": "Registre indisponibilidade com período e justificativa.",
        "steps": [
          "Abra Opções e escolha Bloquear Apartamentos.",
          "Confirme início e final.",
          "Selecione os apartamentos.",
          "Informe uma justificativa objetiva.",
          "Confira reservas afetadas antes de gravar."
        ],
        "attention": "O bloqueio reduz a disponibilidade comercial e exige autorização do responsável."
      },
      {
        "id": "consultar-grupos",
        "title": "Consultar grupos",
        "summary": "Localize grupos reservados, em orçamento, check-in ou check-out.",
        "steps": [
          "Acesse Hotel e selecione Grupos.",
          "Escolha a situação desejada.",
          "Ajuste período, hotel e vendedor.",
          "Confira as reservas vinculadas ao grupo."
        ],
        "image": "/treinamentos-assets/grupos-filtros-e-status.png",
        "imageAlt": "Filtros e situações da tela de Grupos"
      },
      {
        "id": "rooming-list",
        "title": "Utilizar a Rooming List",
        "summary": "Confira hóspedes e apartamentos relacionados a um grupo.",
        "steps": [
          "Selecione o grupo correto.",
          "Abra Rooming List.",
          "Valide hotel, período, hóspedes e apartamentos.",
          "Compartilhe somente com os setores autorizados."
        ],
        "attention": "A Rooming List contém dados pessoais e não deve ser enviada por contas ou grupos não autorizados."
      }
    ]
  },
  {
    "id": "walkin-hospedes",
    "code": "MÓDULO 03",
    "shortTitle": "Walk-in e Hóspedes",
    "title": "Walk-in, Dashboard e Hóspedes",
    "description": "Consulte disponibilidade, registre atendimentos sem reserva e mantenha os cadastros corretos.",
    "activities": [
      {
        "id": "disponibilidade-walkin",
        "title": "Consultar disponibilidade para Walk-in",
        "summary": "Encontre apartamentos disponíveis de acordo com período e ocupação.",
        "steps": [
          "Acesse Hotel e selecione Walk-in.",
          "Informe check-in e check-out.",
          "Informe adultos e crianças.",
          "Clique em Consultar disponibilidade.",
          "Confira capacidade, categoria, vista e piso."
        ],
        "image": "/treinamentos-assets/walk-in-consulta-disponibilidade.png",
        "imageAlt": "Consulta de disponibilidade do Walk-in"
      },
      {
        "id": "registrar-walkin",
        "title": "Registrar um Walk-in",
        "summary": "Preencha hospedagem, tarifa, titular e acompanhantes.",
        "steps": [
          "Selecione o apartamento disponível.",
          "Confirme datas, regime e origem da venda.",
          "Informe a tarifa autorizada.",
          "Preencha titular e acompanhantes.",
          "Revise todos os dados antes de confirmar."
        ],
        "attention": "Retroativo e No-show só devem ser usados conforme a regra definida pela gerência e auditoria."
      },
      {
        "id": "pre-checkin",
        "title": "Conferir um pré-check-in",
        "summary": "Valide o registro recebido antes de convertê-lo em hospedagem.",
        "steps": [
          "Localize o pré-check-in.",
          "Compare nome, documento e período.",
          "Confirme que os dados pertencem ao hóspede presente.",
          "Siga o procedimento interno para concluir o atendimento."
        ],
        "attention": "A lista de pré-check-in contém dados pessoais e exige discrição no atendimento."
      },
      {
        "id": "consultar-dashboard",
        "title": "Consultar o Dashboard",
        "summary": "Acompanhe indicadores operacionais, financeiros e de pessoas.",
        "steps": [
          "Acesse Hotel e selecione Dashboard.",
          "Escolha a empresa ou visão consolidada.",
          "Confirme o período.",
          "Selecione a área do indicador.",
          "Observe título, unidade e momento da atualização."
        ],
        "attention": "Indicadores financeiros, comerciais e de RH são informações internas."
      },
      {
        "id": "cadastro-hospede",
        "title": "Localizar ou cadastrar um hóspede",
        "summary": "Evite duplicidades e mantenha documentos e contatos corretos.",
        "steps": [
          "Pesquise primeiro pelo CPF.",
          "Se necessário, pesquise pelo nome.",
          "Compare documento, nascimento e contatos.",
          "Preencha os campos obrigatórios.",
          "Revise antes de gravar."
        ],
        "image": "/treinamentos-assets/cadastro-hospedes-campos.png",
        "imageAlt": "Campos do Cadastro de Hóspedes"
      }
    ]
  },
  {
    "id": "financeiro",
    "code": "MÓDULO 04",
    "shortTitle": "Financeiro",
    "title": "Financeiro",
    "description": "Consulte títulos, concilie contas, acompanhe o caixa e analise resultados e planejamento.",
    "activities": [
      {
        "id": "baixar-titulos",
        "title": "Consultar e baixar títulos",
        "summary": "Localize o documento e confirme parcela, valor e quitação.",
        "steps": [
          "Informe conta e período de vencimento.",
          "Confira a data da quitação.",
          "Clique em Consultar.",
          "Compare documento, parcela, conta e valor com o comprovante.",
          "Lance e confirme somente com autorização."
        ],
        "attention": "Uma baixa confirmada altera títulos e saldos. Nunca use a confirmação para testar.",
        "image": "/treinamentos-assets/financeiro-baixa-filtros.png",
        "imageAlt": "Filtros da Baixa de títulos"
      },
      {
        "id": "conciliar-contas",
        "title": "Conciliar contas e caixa",
        "summary": "Compare as movimentações do sistema com extratos e contagens.",
        "steps": [
          "Selecione conta e período.",
          "Escolha o centro de custo.",
          "Consulte as movimentações.",
          "Compare com extrato ou contagem.",
          "Registre diferenças conforme a política do Financeiro."
        ],
        "image": "/treinamentos-assets/financeiro-conciliacao-filtros.png",
        "imageAlt": "Filtros da Conciliação de contas"
      },
      {
        "id": "conta-corrente",
        "title": "Consultar Conta Corrente e Movimento",
        "summary": "Acompanhe documentos, débitos, créditos, baixas e saldos.",
        "steps": [
          "Selecione a conta.",
          "Informe o período.",
          "Aplique centro de custo quando necessário.",
          "Confira saldo inicial, movimentações e saldo final.",
          "Investigue documentos sem baixa ou com datas divergentes."
        ]
      },
      {
        "id": "fluxo-caixa",
        "title": "Analisar o Fluxo de Caixa",
        "summary": "Visualize compromissos a pagar, recebimentos e saldos futuros.",
        "steps": [
          "Escolha a empresa.",
          "Selecione Geral, A pagar, Pagos, A receber ou Recebidos.",
          "Defina o período.",
          "Clique em Consultar.",
          "Analise vencimentos e concentrações de entradas e saídas."
        ],
        "image": "/treinamentos-assets/financeiro-fluxo-caixa-filtros.png",
        "imageAlt": "Filtros do Fluxo de caixa"
      },
      {
        "id": "demonstrativo-mensal",
        "title": "Consultar o Demonstrativo mensal",
        "summary": "Compare competências por empresa, modelo e centro de custo.",
        "steps": [
          "Escolha a empresa e o mês inicial.",
          "Selecione a quantidade de meses.",
          "Escolha Completo, Ativo, Passivo ou Resultado.",
          "Selecione o centro de custo.",
          "Clique em Consultar e compare apenas filtros equivalentes."
        ],
        "image": "/treinamentos-assets/financeiro-demonstrativo-filtros.png",
        "imageAlt": "Filtros dos Demonstrativos mensais"
      },
      {
        "id": "planejamento",
        "title": "Atualizar o Planejamento",
        "summary": "Acompanhe metas, custos, ocupação, tarifas e premissas financeiras.",
        "steps": [
          "Confirme empresa e período de planejamento.",
          "Revise as premissas e a fonte dos valores.",
          "Consulte quadro de vagas, provisionamentos e plano de contas quando necessário.",
          "Atualize somente informações aprovadas."
        ],
        "attention": "Mudanças em premissas afetam projeções e indicadores gerenciais.",
        "image": "/treinamentos-assets/financeiro-planejamento-acoes.png",
        "imageAlt": "Área de metas e indicadores do Planejamento"
      }
    ]
  },
  {
    "id": "pdv-estoques",
    "code": "MÓDULO 05",
    "shortTitle": "PDV e Estoques",
    "title": "PDV, Caixas e Estoques",
    "description": "Concilie cartões, mantenha cardápios e fichas técnicas e controle caixas e inventários.",
    "activities": [
      {
        "id": "conciliar-cartoes",
        "title": "Conciliar cartões",
        "summary": "Compare vendas, recebimentos, taxas e saldos contábeis.",
        "steps": [
          "Informe data inicial e final.",
          "Execute a consulta autorizada.",
          "Compare débito e crédito por vencimento.",
          "Verifique taxas, antecipações, cancelamentos e chargebacks.",
          "Encaminhe diferenças ao responsável."
        ],
        "image": "/treinamentos-assets/pdv-conciliacao-cartoes-filtros.png",
        "imageAlt": "Filtros da Conciliação de Cartões"
      },
      {
        "id": "manter-cardapio",
        "title": "Consultar ou alterar cardápios",
        "summary": "Gerencie estrutura, preço, descrição e dias disponíveis.",
        "steps": [
          "Selecione o PDV.",
          "Filtre a estrutura e clique em Visualizar.",
          "Confira código, descrição, base, ajuste e preço.",
          "Valide os dias em que o item deve constar.",
          "Confirme alterações somente após aprovação."
        ],
        "attention": "Excluir ou alterar um item pode afetar vendas e relatórios.",
        "image": "/treinamentos-assets/pdv-cardapio-filtros.png",
        "imageAlt": "Filtros e ações do Cadastro de Cardápios"
      },
      {
        "id": "ficha-tecnica",
        "title": "Preencher uma ficha técnica",
        "summary": "Vincule produtos vendidos aos insumos e quantidades corretas.",
        "steps": [
          "Selecione o PDV e o produto.",
          "Localize cada insumo.",
          "Informe quantidade e unidade corretas.",
          "Confira rendimento e perdas.",
          "Compare o custo calculado com a referência aprovada."
        ],
        "attention": "Quilo, grama, litro e unidade não são intercambiáveis. Uma unidade errada distorce o custo."
      },
      {
        "id": "consultar-caixa-pdv",
        "title": "Consultar caixas do PDV",
        "summary": "Confira recebimentos, contas, operadores e cancelamentos.",
        "steps": [
          "Informe o período.",
          "Selecione PDV e caixa.",
          "Clique em Consultar.",
          "Compare os recebimentos por forma de pagamento.",
          "Verifique cancelamentos, estornos, descontos e contas abertas."
        ],
        "image": "/treinamentos-assets/pdv-caixas-filtros.png",
        "imageAlt": "Filtros da consulta de Caixas PDV"
      },
      {
        "id": "registrar-inventario",
        "title": "Registrar um inventário",
        "summary": "Conte produtos e compare quantidades físicas com o estoque.",
        "steps": [
          "Informe data e centro de custo.",
          "Localize o produto.",
          "Conte na unidade correta.",
          "Informe a quantidade.",
          "Faça segunda contagem quando houver diferença.",
          "Confirme somente após revisão."
        ],
        "attention": "Não altere a contagem apenas para igualar o saldo do sistema.",
        "image": "/treinamentos-assets/pdv-inventarios-filtros.png",
        "imageAlt": "Campos da tela de Inventários"
      },
      {
        "id": "investigar-estoque",
        "title": "Investigar diferenças de estoque",
        "summary": "Analise entradas, saídas, transferências, perdas e consumo previsto.",
        "steps": [
          "Confirme centro de custo e unidade.",
          "Compare o período desde o último inventário.",
          "Procure transferências pendentes.",
          "Verifique perdas e cancelamentos.",
          "Compare ficha técnica com consumo real."
        ]
      }
    ]
  },
  {
    "id": "contabilidade-admin",
    "code": "MÓDULO 06",
    "shortTitle": "Contabilidade e Admin",
    "title": "Contabilidade e Administração",
    "description": "Consulte registros contábeis e proteja configurações bancárias e fiscais restritas.",
    "activities": [
      {
        "id": "plano-contas",
        "title": "Consultar ou manter o Plano de Contas",
        "summary": "Localize contas e confira estrutura, natureza e sistema.",
        "steps": [
          "Pesquise pelo código ou descrição.",
          "Confira a posição na estrutura.",
          "Valide natureza devedora ou credora.",
          "Escolha o sistema correspondente.",
          "Antes de incluir, confirme que não existe conta equivalente."
        ],
        "attention": "Alterar uma conta utilizada pode afetar relatórios históricos e integrações.",
        "image": "/treinamentos-assets/contabilidade-plano-contas.png",
        "imageAlt": "Estrutura do Plano de Contas"
      },
      {
        "id": "livro-razao",
        "title": "Consultar o Livro Razão",
        "summary": "Analise documentos, históricos, débitos, créditos e saldo.",
        "steps": [
          "Selecione a conta.",
          "Informe o período.",
          "Escolha o centro de custo.",
          "Execute a consulta.",
          "Use o documento de origem para investigar divergências."
        ]
      },
      {
        "id": "balancete",
        "title": "Emitir Balancete ou Balanço",
        "summary": "Escolha modelo e nível compatíveis com a análise.",
        "steps": [
          "Selecione empresa e período.",
          "Escolha o centro de custo.",
          "Selecione Saldos, Movimento ou Completo.",
          "Defina o nível de detalhamento.",
          "Confira saldo inicial, débitos, créditos e saldo final."
        ],
        "image": "/treinamentos-assets/contabilidade-balancete-filtros.png",
        "imageAlt": "Filtros de Balancetes e Balanço"
      },
      {
        "id": "emitir-nfce",
        "title": "Consultar ou emitir NFC-e",
        "summary": "Confira venda, impostos e situação antes de emitir ou reprocessar.",
        "steps": [
          "Confirme PDV, conta e período.",
          "Verifique se a nota já foi emitida.",
          "Confira produtos, valores e situação.",
          "Consulte a situação antes de tentar novamente.",
          "Guarde XML, PDF e protocolos conforme a regra fiscal."
        ],
        "attention": "Não altere alíquotas nem reemita uma nota sem orientação do Fiscal."
      },
      {
        "id": "integracao-bancaria",
        "title": "Administrar integração bancária",
        "summary": "Proteja dados de banco, convênio, conta contábil e remessa.",
        "steps": [
          "Confirme empresa e banco.",
          "Valide agência, conta e convênio.",
          "Confira a conta contábil.",
          "Documente a alteração.",
          "Solicite apoio técnico para mudanças em remessa ou retorno."
        ],
        "attention": "Agência, conta e convênio são informações restritas."
      },
      {
        "id": "sefaz",
        "title": "Administrar Sefaz e certificado",
        "summary": "Gerencie certificado, emissão e consultas fiscais com acesso restrito.",
        "steps": [
          "Confirme empresa e CNPJ.",
          "Verifique validade do certificado.",
          "Consulte a situação antes de nova emissão.",
          "Não altere NSU sem diagnóstico.",
          "Preserve XML, PDF e protocolos."
        ],
        "attention": "Nunca compartilhe senha do certificado, token ou arquivo A1 por mensagens comuns."
      }
    ]
  },
  {
    "id": "duvidas-suporte",
    "code": "MÓDULO 07",
    "shortTitle": "Dúvidas e Suporte",
    "title": "Dúvidas frequentes e solução de problemas",
    "description": "Faça verificações seguras antes de repetir uma operação ou solicitar suporte.",
    "activities": [
      {
        "id": "consulta-sem-resultados",
        "title": "Consulta sem resultados",
        "summary": "Revise empresa, período e filtros sem alterar registros.",
        "steps": [
          "Anote os filtros atuais.",
          "Confirme empresa e hotel.",
          "Amplie o período de forma controlada.",
          "Mude apenas um filtro por vez.",
          "Acione o setor responsável se o registro continuar ausente."
        ]
      },
      {
        "id": "relatorios-divergentes",
        "title": "Relatórios com valores diferentes",
        "summary": "Compare critérios antes de classificar uma diferença como erro.",
        "steps": [
          "Compare empresa e período.",
          "Confira a data usada por cada relatório.",
          "Valide situação, centro de custo, modelo e nível.",
          "Registre os dois conjuntos de filtros ao pedir ajuda."
        ]
      },
      {
        "id": "sistema-lento",
        "title": "Sistema lento ou sem resposta",
        "summary": "Evite duplicidades quando uma operação demora.",
        "steps": [
          "Aguarde a conclusão atual.",
          "Não pressione Confirmar repetidamente.",
          "Verifique se outras telas funcionam.",
          "Consulte o registro antes de tentar novamente.",
          "Anote horário e tela para o suporte."
        ],
        "attention": "Repetir comandos pode duplicar reservas, baixas, inventários ou documentos fiscais."
      },
      {
        "id": "solicitar-suporte",
        "title": "Solicitar suporte corretamente",
        "summary": "Envie contexto suficiente sem expor informações confidenciais.",
        "steps": [
          "Informe setor, hotel, tela, data e horário.",
          "Explique o resultado esperado e o apresentado.",
          "Copie a mensagem de erro.",
          "Oculte dados pessoais e financeiros em capturas.",
          "Nunca envie senha, token ou certificado."
        ]
      },
      {
        "id": "validar-manual",
        "title": "Validar uma atividade do manual",
        "summary": "Ajude a transformar a versão preliminar em conteúdo oficial.",
        "steps": [
          "Execute o procedimento com um responsável do setor.",
          "Confirme nomes dos campos e permissões.",
          "Registre diferenças encontradas.",
          "Defina quem aprova o conteúdo.",
          "Informe quando a atividade estiver pronta para gravação do vídeo com áudio."
        ]
      }
    ]
  }
];
