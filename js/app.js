// ==================== NAVIGATION ====================
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const screen = document.getElementById(id);
  if (screen) {
    screen.classList.add('active');
    window.scrollTo(0, 0);
  }
  updateCartBadges();
  if (id === 'profile') updateProfileUI();
}

function toggleMobileMenu() {
  const nav = document.getElementById('mobile-nav');
  const icon = document.getElementById('menu-icon');
  if (!nav) return;
  nav.classList.toggle('open');
  if (icon) {
    icon.classList.toggle('fa-bars');
    icon.classList.toggle('fa-times');
  }
}

// ==================== AUTH (Supabase) ====================
async function handleRegister(event) {
  event.preventDefault();

  const name = document.getElementById('reg-name').value.trim();
  const email = document.getElementById('reg-email').value.trim().toLowerCase();
  const cpf = document.getElementById('reg-cpf').value.trim();
  const phone = document.getElementById('reg-phone').value.trim();
  const password = document.getElementById('reg-password').value;
  const errorEl = document.getElementById('register-error');
  const successEl = document.getElementById('register-success');

  errorEl.style.display = 'none';
  successEl.style.display = 'none';

  if (password.length < 8) {
    errorEl.textContent = 'A senha deve ter no mínimo 8 caracteres.';
    errorEl.style.display = 'block';
    return;
  }

  try {
    const { data, error } = await supabaseClient.auth.signUp({
      email,
      password,
      options: {
        data: {
          name,
          cpf,
          phone
        }
      }
    });

    if (error) {
      errorEl.textContent = error.message === 'User already registered'
        ? 'Este e-mail já está cadastrado. Faça login.'
        : error.message;
      errorEl.style.display = 'block';
      return;
    }

    if (data.user) {
      try {
        await supabaseClient.from('profiles').upsert({
          id: data.user.id,
          name,
          cpf,
          phone
        });
      } catch (e) {
        console.warn('profiles table:', e);
      }
    }

    successEl.textContent = 'Conta criada com sucesso! Entrando...';
    successEl.style.display = 'block';

    setTimeout(() => {
      document.getElementById('register-form').reset();
      successEl.style.display = 'none';
      showScreen('home');
      updateProfileUI();
    }, 1200);
  } catch (err) {
    errorEl.textContent = 'Erro ao criar conta. Tente novamente.';
    errorEl.style.display = 'block';
    console.error(err);
  }
}

async function handleLogin(event) {
  event.preventDefault();

  const emailOrCpf = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  const errorEl = document.getElementById('login-error');

  errorEl.style.display = 'none';

  const email = emailOrCpf.toLowerCase();

  try {
    const { data, error } = await supabaseClient.auth.signInWithPassword({
      email,
      password
    });

    if (error) {
      errorEl.textContent = 'E-mail ou senha incorretos.';
      errorEl.style.display = 'block';
      return;
    }

    document.getElementById('login-form').reset();
    showScreen('home');
    updateProfileUI();
  } catch (err) {
    errorEl.textContent = 'Erro ao entrar. Tente novamente.';
    errorEl.style.display = 'block';
    console.error(err);
  }
}

async function handleLogout() {
  await supabaseClient.auth.signOut();
  cart = [];
  updateCartUI();
  showScreen('landing');
}

async function updateProfileUI() {
  const nameEl = document.getElementById('profile-name');
  const emailEl = document.getElementById('profile-email');

  const { data: { user } } = await supabaseClient.auth.getUser();

  if (user) {
    const meta = user.user_metadata || {};
    if (nameEl) nameEl.textContent = meta.name || user.email?.split('@')[0] || 'Usuário';
    if (emailEl) emailEl.textContent = user.email || '';
  } else {
    if (nameEl) nameEl.textContent = 'Usuário';
    if (emailEl) emailEl.textContent = 'email@email.com';
  }
}

async function checkSession() {
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (session) {
    updateProfileUI();
  }
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
  const badges = document.querySelectorAll('.badge');
  badges.forEach(b => {
    b.style.transform = 'scale(1.3)';
    setTimeout(() => (b.style.transform = 'scale(1)'), 200);
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
      cartList.innerHTML = cart
        .map(
          (item, i) => `
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
      `
        )
        .join('');
    }

    const subtotal = cart.reduce((sum, item) => sum + item.price * item.qty, 0);
    const delivery = 5.9;
    const total = subtotal + delivery;

    const subEl = document.getElementById('subtotal');
    const totalEl = document.getElementById('total');
    const checkoutTotal = document.getElementById('checkout-total');
    const coSub = document.getElementById('co-sub');
    const coTotal = document.getElementById('co-total');

    if (subEl) subEl.textContent = 'R$ ' + subtotal.toFixed(2).replace('.', ',');
    if (totalEl) totalEl.textContent = 'R$ ' + total.toFixed(2).replace('.', ',');
    if (checkoutTotal) checkoutTotal.textContent = 'R$ ' + total.toFixed(2).replace('.', ',');
    if (coSub) coSub.textContent = 'R$ ' + subtotal.toFixed(2).replace('.', ',');
    if (coTotal) coTotal.textContent = 'R$ ' + total.toFixed(2).replace('.', ',');
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
  const qtyEl = document.getElementById('qty');
  const totalEl = document.getElementById('total-price');
  if (qtyEl) qtyEl.textContent = qty;
  if (totalEl) totalEl.textContent = (8.9 * qty).toFixed(2).replace('.', ',');
}

// ==================== PRESCRIPTION ====================
function handleRxUpload() {
  const file = document.getElementById('rx-file').files[0];
  if (!file) return;

  document.getElementById('rx-name').textContent = file.name;
  document.getElementById('rx-preview').classList.remove('hidden');

  setTimeout(() => {
    const status = document.querySelector('.rx-status');
    if (status) {
      status.innerHTML =
        '<i class="fas fa-check-circle" style="color:#10B981"></i> <span style="color:#059669">Receita validada! Você já pode pedir os medicamentos.</span>';
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
  cart = [];
  updateCartUI();
  showScreen('tracking');
}

// ==================== SEARCH FILTER ====================
function filterMeds() {
  const input = document.getElementById('search-input');
  if (!input) return;
  const query = input.value.toLowerCase();
  const cards = document.querySelectorAll('#search-results .med-card');
  cards.forEach(card => {
    const name = card.querySelector('strong').textContent.toLowerCase();
    card.style.display = name.includes(query) ? 'flex' : 'none';
  });
}

// ==================== INIT ====================
document.addEventListener('DOMContentLoaded', () => {
  updateCartBadges();
  checkSession();

  document.querySelectorAll('.payment-option').forEach(opt => {
    opt.addEventListener('click', () => {
      document.querySelectorAll('.payment-option').forEach(o => o.classList.remove('selected'));
      opt.classList.add('selected');
      const input = opt.querySelector('input');
      if (input) input.checked = true;
    });
  });
});
