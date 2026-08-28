# FarmGo — Delivery de Remédios

App de delivery de medicamentos rápido, seguro e legal.

## Sobre o projeto

O **FarmGo** é um protótipo completo de aplicativo web para delivery de remédios. Inclui:

- Landing page institucional
- Login e cadastro de usuários
- Home com categorias e produtos
- Busca de medicamentos
- Upload e validação de receita médica
- Carrinho de compras funcional
- Checkout (Cartão, Pix, Dinheiro)
- Rastreio de pedido em tempo real
- Histórico de pedidos
- Perfil do usuário
- Área da farmácia (dashboard de parceiros)

## Tecnologias

- HTML5
- CSS3 (variáveis, Flexbox, Grid, responsivo)
- JavaScript puro (vanilla)
- Font Awesome (ícones)
- Google Fonts (Inter)

## Como rodar

### Opção 1 — Abrir direto
1. Baixe ou clone o repositório
2. Abra o arquivo `index.html` no navegador (Chrome, Firefox, Safari, Edge)

### Opção 2 — Live Server (recomendado)
1. Abra a pasta no VS Code
2. Instale a extensão **Live Server**
3. Clique com o botão direito em `index.html` → **Open with Live Server**

### Opção 3 — Python (terminal)
```bash
cd farmgo
python -m http.server 8000
```
Depois acesse: http://localhost:8000

## Estrutura do projeto

```
farmgo/
├── index.html          # Página principal (todas as telas)
├── css/
│   └── styles.css      # Estilos completos
├── js/
│   └── app.js          # Lógica do app
├── assets/             # Imagens e ícones (futuro)
├── README.md
└── .gitignore
```

## Telas disponíveis

| Tela              | Descrição                          |
|-------------------|------------------------------------|
| Landing           | Página inicial do site             |
| Login / Cadastro  | Autenticação                       |
| Home              | Início do app                      |
| Busca             | Pesquisa de remédios               |
| Produto           | Detalhe do medicamento             |
| Receita           | Upload de receita médica           |
| Carrinho          | Itens selecionados                 |
| Checkout          | Pagamento                          |
| Rastreio          | Acompanhamento do pedido           |
| Pedidos           | Histórico                          |
| Perfil            | Dados do usuário                   |
| Farmácia          | Dashboard do parceiro              |

## Funcionalidades

- Navegação entre todas as telas
- Carrinho com adicionar/remover e total
- Upload de receita com feedback de validação
- Finalização de pedido com rastreio
- Design mobile-first (otimizado para celular)
- Tema laranja (#F97316)

## Próximos passos (sugestões)

- [ ] Backend real (Node.js / Firebase)
- [ ] Integração com API de farmácias
- [ ] Geolocalização e mapa real
- [ ] Notificações push
- [ ] Autenticação real
- [ ] PWA (instalar como app)

## Licença

MIT
