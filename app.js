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
  if (id === 'checkout' || id === 'cart') updateTotals();
  if (id === 'home') updateFirstPurchaseUI();
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

async function handleForgotPassword(event) {
  event.preventDefault();
  const email = document.getElementById('forgot-email').value.trim().toLowerCase();
  const errorEl = document.getElementById('forgot-error');
  const successEl = document.getElementById('forgot-success');

  errorEl.style.display = 'none';
  successEl.style.display = 'none';

  if (!email) {
    errorEl.textContent = 'Informe o e-mail cadastrado.';
    errorEl.style.display = 'block';
    return;
  }

  try {
    const { error } = await supabaseClient.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + window.location.pathname
    });

    if (error) {
      errorEl.textContent = error.message || 'Não foi possível enviar o e-mail.';
      errorEl.style.display = 'block';
      return;
    }

    successEl.textContent = 'Link enviado! Verifique sua caixa de entrada (e o spam).';
    successEl.style.display = 'block';
    document.getElementById('forgot-form').reset();
  } catch (err) {
    errorEl.textContent = 'Erro ao enviar. Tente novamente.';
    errorEl.style.display = 'block';
    console.error(err);
  }
}

// ==================== PHARMACY ====================
function handlePharmacyLogin(event) {
  event.preventDefault();
  const email = document.getElementById('pharm-email').value.trim();
  const password = document.getElementById('pharm-password').value;
  const errorEl = document.getElementById('pharm-login-error');

  errorEl.style.display = 'none';

  if (!email || password.length < 4) {
    errorEl.textContent = 'E-mail/CNPJ ou senha inválidos.';
    errorEl.style.display = 'block';
    return;
  }

  const name = email.includes('@') ? email.split('@')[0] : 'Farmácia';
  const storeName = document.getElementById('pharm-store-name');
  if (storeName) {
    storeName.textContent = name.charAt(0).toUpperCase() + name.slice(1) + ' Farmácia';
  }
  document.getElementById('pharmacy-login-form').reset();
  const firstTab = document.querySelector('#pharmacy-dashboard .tab');
  showPharmTab('pedidos', firstTab);
  showScreen('pharmacy-dashboard');
}

function handlePharmacyLogout() {
  showScreen('landing');
}

function showPharmTab(tab, btn) {
  ['pedidos', 'motoristas', 'vendas', 'estoque'].forEach(t => {
    const el = document.getElementById('pharm-tab-' + t);
    if (el) el.style.display = t === tab ? 'block' : 'none';
  });
  document.querySelectorAll('#pharmacy-dashboard .tab').forEach(t => t.classList.remove('active'));
  if (btn) btn.classList.add('active');
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

    updateTotals();
  }

  updateCartBadges();
}

const BASE_FREIGHT = 5.9;
let appliedCoupon = null; // { code, type, value }

function isFirstPurchase() {
  return localStorage.getItem('farmgo_has_ordered') !== '1';
}

function getFreight() {
  if (isFirstPurchase()) return 0;
  if (appliedCoupon && appliedCoupon.type === 'frete') return 0;
  return BASE_FREIGHT;
}

function getDiscount(subtotal) {
  if (!appliedCoupon) return 0;
  if (appliedCoupon.type === 'percent') return subtotal * (appliedCoupon.value / 100);
  if (appliedCoupon.type === 'fixed') return Math.min(appliedCoupon.value, subtotal);
  return 0;
}

function updateTotals() {
  const subtotal = cart.reduce((sum, item) => sum + item.price * item.qty, 0);
  const freight = getFreight();
  const discount = getDiscount(subtotal);
  const total = Math.max(0, subtotal + freight - discount);

  const fmt = (n) => 'R$ ' + n.toFixed(2).replace('.', ',');

  const subEl = document.getElementById('subtotal');
  const totalEl = document.getElementById('total');
  const cartFreight = document.getElementById('cart-freight');
  const checkoutTotal = document.getElementById('checkout-total');
  const coSub = document.getElementById('co-sub');
  const coTotal = document.getElementById('co-total');
  const coFreight = document.getElementById('co-freight');
  const coDiscount = document.getElementById('co-discount');
  const coDiscountRow = document.getElementById('co-discount-row');
  const firstHint = document.getElementById('first-order-hint');

  if (subEl) subEl.textContent = fmt(subtotal);
  if (totalEl) totalEl.textContent = fmt(total);
  if (cartFreight) {
    cartFreight.textContent = freight === 0 ? 'Grátis' : fmt(freight);
    cartFreight.style.color = freight === 0 ? 'var(--primary)' : '';
  }
  if (checkoutTotal) checkoutTotal.textContent = fmt(total);
  if (coSub) coSub.textContent = fmt(subtotal);
  if (coTotal) coTotal.textContent = fmt(total);
  if (coFreight) {
    coFreight.textContent = freight === 0 ? 'Grátis' : fmt(freight);
    coFreight.style.color = freight === 0 ? 'var(--primary)' : '';
  }
  if (coDiscountRow && coDiscount) {
    if (discount > 0) {
      coDiscountRow.style.display = 'flex';
      coDiscount.textContent = '- ' + fmt(discount);
    } else {
      coDiscountRow.style.display = 'none';
    }
  }
  if (firstHint) {
    firstHint.style.display = isFirstPurchase() ? 'block' : 'none';
  }
}

function updateFirstPurchaseUI() {
  const title = document.getElementById('banner-title');
  const sub = document.getElementById('banner-sub');
  const banner = document.getElementById('home-banner');
  if (!title || !sub) return;

  if (isFirstPurchase()) {
    title.textContent = 'Bem-vindo! 🎉';
    sub.textContent = 'Frete grátis na sua primeira compra';
    if (banner) banner.style.background = 'linear-gradient(135deg, var(--primary) 0%, #EA580C 100%)';
  } else {
    title.textContent = 'Frete a partir de R$ 5,90';
    sub.textContent = 'Entrega rápida perto de você';
  }
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

// ==================== PRODUCTS ====================
const PRODUCTS = {
  dipirona: {
    id: 'dipirona',
    name: 'Dipirona Monoidratada 500mg',
    shortName: 'Dipirona 500mg',
    lab: 'EMS · 20 comprimidos',
    price: 8.9,
    price2: 9.2,
    icon: 'fa-capsules',
    iconClass: '',
    needsRx: false,
    time: '12 min',
    desc: 'Analgésico e antitérmico indicado para o alívio da dor e da febre. Uso adulto e pediátrico acima de 15 anos.',
    comp: 'Dipirona monoidratada 500 mg por comprimido.',
    usage: '1 comprimido a cada 6 horas, se necessário. Não exceder 4 comprimidos por dia. Preferencialmente após as refeições.',
    contra: 'Hipersensibilidade à dipirona ou a outros pirazolônicos. Não usar em gestantes no 1º e 3º trimestre sem orientação médica. Evitar em pacientes com histórico de agranulocitose.'
  },
  losartana: {
    id: 'losartana',
    name: 'Losartana Potássica 50mg',
    shortName: 'Losartana 50mg',
    lab: 'Medley · 30 comprimidos',
    price: 15.4,
    price2: 16.1,
    icon: 'fa-tablets',
    iconClass: 'blue',
    needsRx: false,
    time: '15 min',
    desc: 'Anti-hipertensivo da classe dos bloqueadores dos receptores de angiotensina II. Usado no controle da pressão arterial.',
    comp: 'Losartana potássica 50 mg por comprimido.',
    usage: '1 comprimido ao dia, preferencialmente no mesmo horário. Pode ser tomado com ou sem alimentos.',
    contra: 'Hipersensibilidade ao losartana. Não usar em gravidez. Cuidado em pacientes com insuficiência hepática ou renal grave.'
  },
  omeprazol: {
    id: 'omeprazol',
    name: 'Omeprazol 20mg',
    shortName: 'Omeprazol 20mg',
    lab: 'Neo Química · 28 cápsulas',
    price: 12.7,
    price2: 13.5,
    icon: 'fa-pills',
    iconClass: 'green',
    needsRx: false,
    time: '18 min',
    desc: 'Inibidor da bomba de prótons. Reduz a produção de ácido no estômago. Indicado para azia, refluxo e úlceras.',
    comp: 'Omeprazol 20 mg por cápsula de liberação retardada.',
    usage: '1 cápsula pela manhã, em jejum, 30 minutos antes do café. Engolir inteira, sem abrir ou mastigar.',
    contra: 'Hipersensibilidade ao omeprazol. Uso prolongado sem orientação médica pode mascarar sintomas graves.'
  },
  amoxicilina: {
    id: 'amoxicilina',
    name: 'Amoxicilina 500mg',
    shortName: 'Amoxicilina 500mg',
    lab: 'EMS · 21 cápsulas',
    price: 22.9,
    price2: 24.5,
    icon: 'fa-prescription-bottle-alt',
    iconClass: 'orange',
    needsRx: true,
    time: '20 min',
    desc: 'Antibiótico da classe das penicilinas. Usado no tratamento de infecções bacterianas (respiratórias, urinárias, de pele, etc.).',
    comp: 'Amoxicilina tri-hidratada equivalente a 500 mg de amoxicilina por cápsula.',
    usage: '1 cápsula a cada 8 horas, ou conforme prescrição médica. Completar todo o tratamento mesmo se os sintomas melhorarem.',
    contra: 'Alergia a penicilina ou cefalosporinas. Requer receita médica. Não interromper o tratamento sem orientação.'
  },
  insulina: {
    id: 'insulina',
    name: 'Insulina NPH 100UI',
    shortName: 'Insulina NPH',
    lab: 'Novo Nordisk · 1 frasco',
    price: 48.0,
    price2: 49.9,
    icon: 'fa-syringe',
    iconClass: 'purple',
    needsRx: true,
    time: '25 min',
    desc: 'Insulina de ação intermediária para controle da glicemia em pacientes com diabetes mellitus.',
    comp: 'Insulina humana recombinante NPH 100 UI/mL.',
    usage: 'Aplicação subcutânea conforme orientação do médico/enfermeiro. Rotacionar os locais de aplicação.',
    contra: 'Hipoglicemia. Requer receita e acompanhamento médico. Manter refrigerada (não congelar).'
  },
  paracetamol_infantil: {
    id: 'paracetamol_infantil',
    name: 'Paracetamol Gotas Infantil',
    shortName: 'Paracetamol Infantil',
    lab: 'Medley · 15 ml',
    price: 11.5,
    price2: 12.9,
    icon: 'fa-baby',
    iconClass: '',
    needsRx: false,
    time: '14 min',
    desc: 'Analgésico e antitérmico em gotas para crianças. Alívio de dor e febre.',
    comp: 'Paracetamol 200 mg/mL.',
    usage: 'Conforme peso da criança e bula. Usar conta-gotas. Não exceder a dose recomendada.',
    contra: 'Hipersensibilidade ao paracetamol. Cuidado em crianças com problemas hepáticos.'
  },
  clonazepam: {
    id: 'clonazepam',
    name: 'Clonazepam 2mg',
    shortName: 'Clonazepam 2mg',
    lab: 'Roche · 30 comprimidos',
    price: 18.9,
    price2: 21.0,
    icon: 'fa-brain',
    iconClass: 'purple',
    needsRx: true,
    time: '22 min',
    desc: 'Benzodiazepínico usado no tratamento de transtornos de ansiedade e crises epilépticas.',
    comp: 'Clonazepam 2 mg por comprimido.',
    usage: 'Conforme prescrição médica. Não interromper abruptamente.',
    contra: 'Requer receita controlada. Não usar com álcool. Risco de dependência com uso prolongado.'
  },
  protetor: {
    id: 'protetor',
    name: 'Protetor Solar FPS 50',
    shortName: 'Protetor Solar FPS 50',
    lab: 'La Roche · 120 ml',
    price: 54.9,
    price2: 59.9,
    icon: 'fa-sun',
    iconClass: '',
    needsRx: false,
    time: '25 min',
    desc: 'Protetor solar de amplo espectro FPS 50. Proteção UVA/UVB para uso diário.',
    comp: 'Filtros solares orgânicos e inorgânicos. FPS 50.',
    usage: 'Aplicar generosamente 15 minutos antes da exposição solar. Reaplicar a cada 2 horas.',
    contra: 'Hipersensibilidade a qualquer componente da fórmula.'
  }
};

let currentProduct = PRODUCTS.dipirona;

function openProduct(id) {
  const p = PRODUCTS[id] || PRODUCTS.dipirona;
  currentProduct = p;
  qty = 1;

  document.getElementById('prod-name').textContent = p.name;
  document.getElementById('prod-lab').textContent = p.lab;
  document.getElementById('prod-price').textContent = 'R$ ' + p.price.toFixed(2).replace('.', ',');
  document.getElementById('prod-desc').textContent = p.desc;
  document.getElementById('prod-comp').textContent = p.comp;
  document.getElementById('prod-usage').textContent = p.usage;
  document.getElementById('prod-contra').textContent = p.contra;
  document.getElementById('prod-pharm-price').textContent = 'R$ ' + p.price.toFixed(2).replace('.', ',');
  document.getElementById('prod-pharm-price-2').textContent = 'R$ ' + p.price2.toFixed(2).replace('.', ',');
  document.getElementById('qty').textContent = '1';
  document.getElementById('total-price').textContent = p.price.toFixed(2).replace('.', ',');

  const iconEl = document.getElementById('prod-icon');
  iconEl.className = 'product-icon';
  iconEl.innerHTML = '<i class="fas ' + p.icon + '"></i>';

  const tagsEl = document.getElementById('prod-tags');
  tagsEl.innerHTML =
    (p.needsRx ? '<span class="tag" style="background:#FEF3C7;color:#D97706">Com receita</span>' : '<span class="tag">Sem receita</span>') +
    '<span class="tag green">Entrega ' + p.time + '</span>';

  showScreen('product');
}

function changeQty(delta) {
  qty = Math.max(1, qty + delta);
  const qtyEl = document.getElementById('qty');
  const totalEl = document.getElementById('total-price');
  if (qtyEl) qtyEl.textContent = qty;
  if (totalEl) totalEl.textContent = (currentProduct.price * qty).toFixed(2).replace('.', ',');
}

function addCurrentProduct() {
  for (let i = 0; i < qty; i++) {
    addToCart(currentProduct.shortName, currentProduct.price);
  }
  showScreen('cart');
}

// ==================== DRIVER ====================
// Login demo: qualquer e-mail + senha com 4+ caracteres
// Em produção: Auth Supabase com role "driver"

function handleDriverLogin(event) {
  event.preventDefault();
  const email = document.getElementById('driver-email').value.trim();
  const password = document.getElementById('driver-password').value;
  const errorEl = document.getElementById('driver-login-error');

  errorEl.style.display = 'none';

  if (!email || password.length < 4) {
    errorEl.textContent = 'E-mail e senha inválidos.';
    errorEl.style.display = 'block';
    return;
  }

  // Demo: aceita qualquer login com senha >= 4 caracteres
  const name = email.split('@')[0];
  document.getElementById('driver-name').textContent =
    name.charAt(0).toUpperCase() + name.slice(1);
  document.getElementById('driver-login-form').reset();
  showScreen('driver-dashboard');
}

function handleDriverLogout() {
  showScreen('landing');
}

function driverMarkDelivered(orderId) {
  const card = document.getElementById('driver-active-delivery');
  if (card) {
    card.innerHTML =
      '<div class="order-header"><span class="order-id">#' +
      orderId +
      '</span><span class="order-status done">Entregue</span></div>' +
      '<div class="order-items">Entrega concluída com sucesso!</div>' +
      '<div class="order-footer"><span>Agora você pode iniciar a próxima</span></div>';
  }
  const done = document.getElementById('driver-stat-done');
  const active = document.getElementById('driver-stat-active');
  if (done) done.textContent = String(Number(done.textContent) + 1);
  if (active) active.textContent = '0';
}

function driverStartDelivery(orderId) {
  alert('Entrega #' + orderId + ' iniciada! Navegação em breve.');
  const active = document.getElementById('driver-stat-active');
  if (active) active.textContent = '1';
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

  const street = document.getElementById('co-street');
  const number = document.getElementById('co-number');
  if (street && !street.value.trim()) {
    alert('Informe o endereço de entrega.');
    street.focus();
    return;
  }
  if (number && !number.value.trim()) {
    alert('Informe o número do endereço.');
    number.focus();
    return;
  }

  // Marca que já fez a primeira compra
  localStorage.setItem('farmgo_has_ordered', '1');
  appliedCoupon = null;
  cart = [];
  updateCartUI();
  updateFirstPurchaseUI();
  showScreen('tracking');
}

function formatCep(input) {
  let v = input.value.replace(/\D/g, '').slice(0, 8);
  if (v.length > 5) v = v.slice(0, 5) + '-' + v.slice(5);
  input.value = v;
}

function applyCoupon() {
  const input = document.getElementById('co-coupon');
  const msg = document.getElementById('coupon-msg');
  if (!input || !msg) return;

  const code = input.value.trim().toUpperCase();
  const coupons = {
    PRIMEIRA: { type: 'frete', value: 0, label: 'Frete grátis aplicado!' },
    FRETE10: { type: 'frete', value: 0, label: 'Frete grátis aplicado!' },
    DESCONTO10: { type: 'percent', value: 10, label: '10% de desconto aplicado!' },
    FARMGO5: { type: 'fixed', value: 5, label: 'R$ 5,00 de desconto aplicado!' }
  };

  if (!code) {
    msg.style.display = 'block';
    msg.style.color = 'var(--danger)';
    msg.textContent = 'Digite um cupom.';
    return;
  }

  if (coupons[code]) {
    // PRIMEIRA só vale na primeira compra
    if (code === 'PRIMEIRA' && !isFirstPurchase()) {
      msg.style.display = 'block';
      msg.style.color = 'var(--danger)';
      msg.textContent = 'Cupom válido apenas na primeira compra.';
      appliedCoupon = null;
      updateTotals();
      return;
    }
    appliedCoupon = { code, ...coupons[code] };
    msg.style.display = 'block';
    msg.style.color = 'var(--primary)';
    msg.textContent = coupons[code].label;
    updateTotals();
  } else {
    appliedCoupon = null;
    msg.style.display = 'block';
    msg.style.color = 'var(--danger)';
    msg.textContent = 'Cupom inválido.';
    updateTotals();
  }
}

// ==================== CATEGORIES ====================
function filterCategory(cat, btn) {
  document.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');

  // Filtra lista da home
  document.querySelectorAll('#home .med-card[data-cat]').forEach(card => {
    const cats = (card.getAttribute('data-cat') || '').split(/\s+/);
    const show = cat === 'todos' || cats.includes(cat);
    card.style.display = show ? 'flex' : 'none';
  });

  // Também vai para busca com filtro aplicado
  if (cat !== 'todos') {
    showScreen('search');
    document.querySelectorAll('#search-results .med-card').forEach(card => {
      const cats = (card.getAttribute('data-cat') || '').split(/\s+/);
      card.style.display = cats.includes(cat) ? 'flex' : 'none';
    });
  }
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
  updateFirstPurchaseUI();

  document.querySelectorAll('.payment-option').forEach(opt => {
    opt.addEventListener('click', () => {
      document.querySelectorAll('.payment-option').forEach(o => o.classList.remove('selected'));
      opt.classList.add('selected');
      const input = opt.querySelector('input');
      if (input) input.checked = true;
      const cardFields = document.getElementById('card-fields');
      if (cardFields) {
        cardFields.style.display = input && input.value === 'card' ? 'block' : 'none';
      }
    });
  });
});
