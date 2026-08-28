// ==================== NAVIGATION ====================
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const screen = document.getElementById(id);
  if (screen) {
    screen.classList.add('active');
    window.scrollTo(0, 0);
  }
  updateCartBadges();
}

function toggleMobileMenu() {
  // Simple toggle for demo
  alert('Menu mobile — em produção abriria o menu lateral');
}

// ==================== CART ====================
let cart = [];
let qty = 1;

function addToCart(name, price) {
  const existing = cart.find(item => item.name === name);
  if (existing) {
    existing.qty += 1;
  } else {
    cart.push({ name, price, qty: 1 });
  }
  updateCartUI();
  // Feedback visual
  const badges = document.querySelectorAll('.badge');
  badges.forEach(b => {
    b.style.transform = 'scale(1.3)';
    setTimeout(() => b.style.transform = 'scale(1)', 200);
  });
}

function updateCartUI() {
  const cartEmpty = document.getElementById('cart-empty');
  const cartItems = document.getElementById('cart-items');
  const cartFooter = document.getElementById('cart-footer');
  const cartList = document.getElementById('cart-list');

  if (cart.length === 0) {
    if (cartEmpty) cartEmpty.classList.remove('hidden');
    if (cartItems) cartItems.classList.add('hidden');
    if (cartFooter) cartFooter.style.display = 'none';
  } else {
    if (cartEmpty) cartEmpty.classList.add('hidden');
    if (cartItems) cartItems.classList.remove('hidden');
    if (cartFooter) cartFooter.style.display = 'flex';

    if (cartList) {
      cartList.innerHTML = cart.map((item, i) => `
        <div class="cart-item">
          <div class="med-icon"><i class="fas fa-capsules"></i></div>
          <div class="cart-item-info">
            <strong>${item.name}</strong>
            <span>R$ ${(item.price * item.qty).toFixed(2).replace('.', ',')}</span>
          </div>
          <div class="qty-selector">
            <button onclick="changeCartQty(${i}, -1)">−</button>
            <span>${item.qty}</span>
            <button onclick="changeCartQty(${i}, 1)">+</button>
          </div>
        </div>
      `).join('');
    }

    const subtotal = cart.reduce((sum, item) => sum + item.price * item.qty, 0);
    const delivery = 5.90;
    const total = subtotal + delivery;

    const subEl = document.getElementById('subtotal');
    const totalEl = document.getElementById('total');
    const checkoutTotal = document.getElementById('checkout-total');
    const coSub = document.getElementById('co-sub');
    const coTotal = document.getElementById('co-total');

    if (subEl) subEl.textContent = `R$ ${subtotal.toFixed(2).replace('.', ',')}`;
    if (totalEl) totalEl.textContent = `R$ ${total.toFixed(2).replace('.', ',')}`;
    if (checkoutTotal) checkoutTotal.textContent = `R$ ${total.toFixed(2).replace('.', ',')}`;
    if (coSub) coSub.textContent = `R$ ${subtotal.toFixed(2).replace('.', ',')}`;
    if (coTotal) coTotal.textContent = `R$ ${total.toFixed(2).replace('.', ',')}`;
  }

  updateCartBadges();
}

function changeCartQty(index, delta) {
  cart[index].qty += delta;
  if (cart[index].qty <= 0) {
    cart.splice(index, 1);
  }
  updateCartUI();
}

function updateCartBadges() {
  const count = cart.reduce((sum, item) => sum + item.qty, 0);
  document.querySelectorAll('.badge').forEach(b => {
    b.textContent = count;
    b.style.display = count > 0 ? 'flex' : 'none';
  });
}

// ==================== PRODUCT QTY ====================
function changeQty(delta) {
  qty = Math.max(1, qty + delta);
  document.getElementById('qty').textContent = qty;
  const total = (8.90 * qty).toFixed(2).replace('.', ',');
  document.getElementById('total-price').textContent = total;
}

// ==================== PRESCRIPTION ====================
function handleRxUpload() {
  const file = document.getElementById('rx-file').files[0];
  if (!file) return;

  document.getElementById('rx-name').textContent = file.name;
  document.getElementById('rx-preview').classList.remove('hidden');

  // Simulate validation
  setTimeout(() => {
    const status = document.querySelector('.rx-status');
    if (status) {
      status.innerHTML = '<i class="fas fa-check-circle" style="color:#10B981"></i> <span style="color:#059669">Receita validada! Você já pode pedir os medicamentos.</span>';
    }
  }, 2500);
}

function removeRx() {
  document.getElementById('rx-preview').classList.add('hidden');
  document.getElementById('rx-file').value = '';
}

// ==================== ORDER ====================
function placeOrder() {
  if (cart.length === 0) {
    alert('Carrinho vazio!');
    return;
  }
  // Simulate order
  cart = [];
  updateCartUI();
  showScreen('tracking');
}

// ==================== SEARCH FILTER (demo) ====================
function filterMeds() {
  const query = document.getElementById('search-input').value.toLowerCase();
  const cards = document.querySelectorAll('#search-results .med-card');
  cards.forEach(card => {
    const name = card.querySelector('strong').textContent.toLowerCase();
    card.style.display = name.includes(query) ? 'flex' : 'none';
  });
}

// ==================== INIT ====================
document.addEventListener('DOMContentLoaded', () => {
  updateCartBadges();

  // Payment option selection
  document.querySelectorAll('.payment-option').forEach(opt => {
    opt.addEventListener('click', () => {
      document.querySelectorAll('.payment-option').forEach(o => o.classList.remove('selected'));
      opt.classList.add('selected');
      opt.querySelector('input').checked = true;
    });
  });
});
