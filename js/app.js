// ==================== NAVIGATION ====================
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const screen = document.getElementById(id);
  if (screen) {
    screen.classList.add('active');
    window.scrollTo(0, 0);
  }
  updateCartBadges();
  if (id === 'profile' || id === 'profile-edit' || id === 'profile-addresses' || id === 'profile-notifs') updateProfileUI();
  if (id === 'orders') renderOrdersList('active');
  if (id === 'tracking' && trackMap) setTimeout(() => trackMap.invalidateSize(), 200);
  if (id === 'prescription') renderRxHistory();
  if (id === 'pharmacy-dashboard') refreshPharmacyFromOrders();
  if (id === 'driver-dashboard') refreshDriverFromOrders();
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

  if (!name) {
    errorEl.textContent = 'Informe seu nome completo.';
    errorEl.style.display = 'block';
    return;
  }

  if (!/^[0-9]{6}$/.test(password)) {
    errorEl.textContent = 'A senha deve ter exatamente 6 dígitos numéricos.';
    errorEl.style.display = 'block';
    return;
  }

  try {
    const { data, error } = await supabaseClient.auth.signUp({
      email,
      password,
      options: {
        data: {
          name: name,
          full_name: name,
          cpf: cpf,
          phone: phone
        }
      }
    });

    if (error) {
      const msg = (error.message || '').toLowerCase();
      if (msg.includes('already') || msg.includes('registered')) {
        errorEl.textContent = 'Este e-mail já está cadastrado. Faça login.';
      } else if (msg.includes('password')) {
        errorEl.textContent = 'Senha inválida. Use 6 dígitos. (Confira a política de senha no Supabase)';
      } else {
        errorEl.textContent = error.message || 'Erro ao criar conta.';
      }
      errorEl.style.display = 'block';
      return;
    }

    // Conta já existia (Supabase às vezes retorna user sem identities)
    if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
      errorEl.textContent = 'Este e-mail já está cadastrado. Faça login.';
      errorEl.style.display = 'block';
      return;
    }

    // Garante sessão: se confirm email estiver ligado, tenta login na hora
    let session = data.session;
    if (!session) {
      const { data: loginData, error: loginErr } = await supabaseClient.auth.signInWithPassword({
        email,
        password
      });
      if (loginErr) {
        successEl.textContent = 'Conta criada! Ative o login: no Supabase → Authentication → Providers → Email → desative "Confirm email". Depois entre com seu e-mail e senha.';
        successEl.style.display = 'block';
        return;
      }
      session = loginData.session;
    }

    // Atualiza metadata do nome (garante que fica salvo)
    await supabaseClient.auth.updateUser({
      data: { name: name, full_name: name, cpf: cpf, phone: phone }
    });

    // Cache local do perfil (backup + perfil offline)
    saveLocalProfile({
      id: data.user?.id,
      name,
      email,
      cpf,
      phone
    });

    // Tenta salvar na tabela profiles (opcional)
    if (data.user?.id) {
      try {
        await supabaseClient.from('profiles').upsert({
          id: data.user.id,
          name,
          cpf,
          phone
        });
      } catch (e) {
        console.warn('profiles:', e);
      }
    }

    successEl.textContent = 'Conta criada com sucesso! Entrando...';
    successEl.style.display = 'block';

    biometricUnlocked = true;
    if (window.PublicKeyCredential) {
      tryRegisterBiometric(email);
    }

    setTimeout(() => {
      document.getElementById('register-form').reset();
      successEl.style.display = 'none';
      showScreen('home');
      updateProfileUI();
      updateBiometricButton();
    }, 800);
  } catch (err) {
    errorEl.textContent = 'Erro de conexão. Verifique a internet e o Supabase.';
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

  if (!/^[0-9]{6}$/.test(password)) {
    errorEl.textContent = 'A senha deve ter exatamente 6 dígitos.';
    errorEl.style.display = 'block';
    return;
  }

  // Login por e-mail (CPF só se estiver no perfil local)
  let email = emailOrCpf.toLowerCase();
  if (!email.includes('@')) {
    const local = getLocalProfile();
    if (local && (local.cpf === emailOrCpf || local.cpf === emailOrCpf.replace(/\D/g, ''))) {
      email = local.email;
    } else {
      errorEl.textContent = 'Use o e-mail cadastrado para entrar.';
      errorEl.style.display = 'block';
      return;
    }
  }

  try {
    const { data, error } = await supabaseClient.auth.signInWithPassword({
      email,
      password
    });

    if (error) {
      const msg = (error.message || '').toLowerCase();
      if (msg.includes('confirm') || msg.includes('email not confirmed')) {
        errorEl.textContent = 'Confirme o e-mail ou desative "Confirm email" no Supabase (Authentication → Providers → Email).';
      } else if (msg.includes('invalid')) {
        errorEl.textContent = 'E-mail ou senha incorretos.';
      } else {
        errorEl.textContent = error.message || 'E-mail ou senha incorretos.';
      }
      errorEl.style.display = 'block';
      return;
    }

    const user = data.user;
    const meta = user?.user_metadata || {};
    const local = getLocalProfile() || {};
    saveLocalProfile({
      id: user.id,
      name: meta.name || meta.full_name || local.name || email.split('@')[0],
      email: user.email,
      cpf: meta.cpf || local.cpf || '',
      phone: meta.phone || local.phone || ''
    });

    biometricUnlocked = true;

    if (window.PublicKeyCredential) {
      tryRegisterBiometric(email);
    }

    document.getElementById('login-form').reset();
    showScreen('home');
    updateProfileUI();
    updateBiometricButton();
  } catch (err) {
    errorEl.textContent = 'Erro de conexão. Tente novamente.';
    errorEl.style.display = 'block';
    console.error(err);
  }
}

// ==================== BIOMETRIA SEGURA (WebAuthn) ====================
// Nunca armazena senha. A digital desbloqueia a sessão já autenticada no Supabase
// (refresh token gerenciado pelo client). Credencial fica no autenticador do aparelho.

const BIOMETRIC_KEY = 'farmgo_webauthn_v2';
let biometricUnlocked = false;

function bufferToBase64url(buffer) {
  const bytes = new Uint8Array(buffer);
  let str = '';
  bytes.forEach(b => { str += String.fromCharCode(b); });
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64urlToBuffer(base64url) {
  const pad = '='.repeat((4 - (base64url.length % 4)) % 4);
  const base64 = (base64url + pad).replace(/-/g, '+').replace(/_/g, '/');
  const str = atob(base64);
  const bytes = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) bytes[i] = str.charCodeAt(i);
  return bytes.buffer;
}

function getBiometricConfig() {
  try {
    return JSON.parse(localStorage.getItem(BIOMETRIC_KEY) || 'null');
  } catch {
    return null;
  }
}

function setBiometricConfig(cfg) {
  localStorage.setItem(BIOMETRIC_KEY, JSON.stringify(cfg));
}

function clearBiometricConfig() {
  localStorage.removeItem(BIOMETRIC_KEY);
  // limpa versão antiga insegura (com senha)
  localStorage.removeItem('farmgo_webauthn');
}

async function isBiometricAvailable() {
  if (!window.PublicKeyCredential) return false;
  try {
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

function getRpId() {
  const host = location.hostname;
  if (!host || host === 'localhost' || host === '127.0.0.1') return 'localhost';
  return host;
}

async function tryRegisterBiometric(email) {
  try {
    if (!(await isBiometricAvailable())) return;

    const existing = getBiometricConfig();
    if (existing && existing.email === email && existing.credentialId) {
      updateBiometricButton();
      return;
    }

    // Só registra com sessão Supabase ativa
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session) return;

    const ok = confirm(
      'Ativar desbloqueio por digital neste aparelho?\n\n' +
      'Sua senha NÃO será salva. A digital só funciona neste dispositivo.'
    );
    if (!ok) return;

    const userId = crypto.getRandomValues(new Uint8Array(16));
    const challenge = crypto.getRandomValues(new Uint8Array(32));

    const credential = await navigator.credentials.create({
      publicKey: {
        challenge,
        rp: { name: 'FarmGo', id: getRpId() },
        user: {
          id: userId,
          name: email,
          displayName: email.split('@')[0] || 'Usuário FarmGo'
        },
        pubKeyCredParams: [
          { alg: -7, type: 'public-key' },
          { alg: -257, type: 'public-key' }
        ],
        authenticatorSelection: {
          authenticatorAttachment: 'platform',
          userVerification: 'required',
          residentKey: 'required',
          requireResidentKey: true
        },
        timeout: 90000,
        attestation: 'none'
      }
    });

    if (!credential) return;

    setBiometricConfig({
      version: 2,
      email,
      userId: session.user.id,
      credentialId: bufferToBase64url(credential.rawId),
      createdAt: new Date().toISOString()
      // NUNCA grava senha
    });

    biometricUnlocked = true;
    alert('Digital ativada com segurança neste aparelho.');
    updateBiometricButton();
  } catch (e) {
    console.warn('Falha ao registrar biometria:', e);
    if (e && e.name === 'NotAllowedError') {
      // usuário cancelou
    } else if (location.protocol === 'file:') {
      alert('Biometria exige HTTPS (ou localhost). Abra o site por um servidor/hosting.');
    }
  }
}

async function verifyBiometric() {
  const stored = getBiometricConfig();
  if (!stored || !stored.credentialId) {
    throw new Error('NO_CREDENTIAL');
  }

  const challenge = crypto.getRandomValues(new Uint8Array(32));

  const assertion = await navigator.credentials.get({
    publicKey: {
      challenge,
      rpId: getRpId(),
      allowCredentials: [{
        id: base64urlToBuffer(stored.credentialId),
        type: 'public-key',
        transports: ['internal']
      }],
      userVerification: 'required',
      timeout: 90000
    }
  });

  if (!assertion || !assertion.rawId) {
    throw new Error('FAILED');
  }

  // Confere se a credencial usada é a registrada
  const usedId = bufferToBase64url(assertion.rawId);
  if (usedId !== stored.credentialId) {
    throw new Error('MISMATCH');
  }

  return stored;
}

async function loginWithBiometric() {
  const errorEl = document.getElementById('login-error');
  if (errorEl) errorEl.style.display = 'none';

  try {
    if (!(await isBiometricAvailable())) {
      if (errorEl) {
        errorEl.textContent = 'Biometria não disponível neste aparelho/navegador.';
        errorEl.style.display = 'block';
      }
      return;
    }

    await verifyBiometric();

    // Digital OK → tenta restaurar sessão Supabase (sem senha)
    const { data: { session }, error: sessErr } = await supabaseClient.auth.getSession();
    if (sessErr) console.warn(sessErr);

    if (session) {
      const { data: refreshed, error: refErr } = await supabaseClient.auth.refreshSession();
      if (refErr || !refreshed.session) {
        // sessão inválida
        biometricUnlocked = false;
        if (errorEl) {
          errorEl.textContent = 'Sessão expirada. Entre com a senha de 6 dígitos.';
          errorEl.style.display = 'block';
        }
        return;
      }
      biometricUnlocked = true;
      showScreen('home');
      updateProfileUI();
      return;
    }

    // Sem sessão ativa: biometria sozinha não recria login (isso é seguro)
    if (errorEl) {
      errorEl.textContent = 'Sessão encerrada. Entre com a senha de 6 dígitos uma vez; depois a digital funciona de novo.';
      errorEl.style.display = 'block';
    }
  } catch (e) {
    console.warn(e);
    if (errorEl) {
      if (e.message === 'NO_CREDENTIAL') {
        errorEl.textContent = 'Nenhuma digital cadastrada. Entre com a senha e ative a digital.';
      } else if (e.name === 'NotAllowedError') {
        errorEl.textContent = 'Autenticação cancelada ou digital não reconhecida.';
      } else {
        errorEl.textContent = 'Falha na biometria. Use a senha de 6 dígitos.';
      }
      errorEl.style.display = 'block';
    }
  }
}

function updateBiometricButton() {
  const btn = document.getElementById('btn-biometric');
  if (!btn) return;
  const stored = getBiometricConfig();
  const supported = !!(window.PublicKeyCredential);
  btn.style.display = (supported && stored && stored.credentialId) ? 'flex' : 'none';
}

async function requireBiometricIfEnabled() {
  const stored = getBiometricConfig();
  if (!stored || !stored.credentialId || biometricUnlocked) return true;

  const { data: { session } } = await supabaseClient.auth.getSession();
  if (!session) return true; // sem sessão, fluxo normal de login

  try {
    await verifyBiometric();
    biometricUnlocked = true;
    return true;
  } catch {
    return false;
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
  biometricUnlocked = false;
  cart = [];
  updateCartUI();
  updateBiometricButton();
  showScreen('landing');
}

function disableBiometric() {
  clearBiometricConfig();
  biometricUnlocked = false;
  updateBiometricButton();
  alert('Desbloqueio por digital desativado neste aparelho.');
}

function getLocalProfile() {
  try {
    return JSON.parse(localStorage.getItem('farmgo_profile') || 'null');
  } catch {
    return null;
  }
}

function saveLocalProfile(profile) {
  const prev = getLocalProfile() || {};
  const next = { ...prev, ...profile };
  localStorage.setItem('farmgo_profile', JSON.stringify(next));
  return next;
}

function getAddresses() {
  try {
    return JSON.parse(localStorage.getItem('farmgo_addresses') || '[]');
  } catch {
    return [];
  }
}

function saveAddresses(list) {
  localStorage.setItem('farmgo_addresses', JSON.stringify(list));
}

async function updateProfileUI() {
  const nameEl = document.getElementById('profile-name');
  const emailEl = document.getElementById('profile-email');
  const phoneEl = document.getElementById('profile-phone');
  const cpfEl = document.getElementById('profile-cpf');

  let name = 'Usuário';
  let email = '';
  let phone = '';
  let cpf = '';

  try {
    const { data: { user } } = await supabaseClient.auth.getUser();
    const local = getLocalProfile() || {};
    if (user) {
      const meta = user.user_metadata || {};
      name = meta.name || meta.full_name || local.name || user.email?.split('@')[0] || 'Usuário';
      email = user.email || local.email || '';
      phone = meta.phone || local.phone || '';
      cpf = meta.cpf || local.cpf || '';
      saveLocalProfile({ id: user.id, name, email, phone, cpf });
    } else if (local.email) {
      name = local.name || 'Usuário';
      email = local.email;
      phone = local.phone || '';
      cpf = local.cpf || '';
    }
  } catch (e) {
    const local = getLocalProfile();
    if (local) {
      name = local.name || 'Usuário';
      email = local.email || '';
      phone = local.phone || '';
      cpf = local.cpf || '';
    }
  }

  if (nameEl) nameEl.textContent = name;
  if (emailEl) emailEl.textContent = email || 'email@email.com';
  if (phoneEl) phoneEl.textContent = phone || '—';
  if (cpfEl) cpfEl.textContent = cpf || '—';

  // Form edit
  const editName = document.getElementById('edit-name');
  const editPhone = document.getElementById('edit-phone');
  const editCpf = document.getElementById('edit-cpf');
  if (editName) editName.value = name === 'Usuário' ? '' : name;
  if (editPhone) editPhone.value = phone || '';
  if (editCpf) editCpf.value = cpf || '';

  renderAddressList();
  renderNotifPrefs();
}

async function saveProfileEdit(event) {
  event.preventDefault();
  const name = document.getElementById('edit-name').value.trim();
  const phone = document.getElementById('edit-phone').value.trim();
  const cpf = document.getElementById('edit-cpf').value.trim();
  const msg = document.getElementById('profile-edit-msg');

  if (!name) {
    if (msg) {
      msg.style.display = 'block';
      msg.className = 'form-error';
      msg.textContent = 'Informe o nome.';
    }
    return;
  }

  saveLocalProfile({ name, phone, cpf });

  try {
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (user) {
      await supabaseClient.auth.updateUser({
        data: { name, full_name: name, phone, cpf }
      });
      try {
        await supabaseClient.from('profiles').upsert({
          id: user.id,
          name,
          phone,
          cpf
        });
      } catch (_) {}
    }
  } catch (e) {
    console.warn(e);
  }

  if (msg) {
    msg.style.display = 'block';
    msg.className = 'form-success';
    msg.textContent = 'Dados salvos!';
  }
  updateProfileUI();
  setTimeout(() => {
    if (msg) msg.style.display = 'none';
    showScreen('profile');
  }, 800);
}

function renderAddressList() {
  const list = document.getElementById('address-list');
  if (!list) return;
  const addresses = getAddresses();
  if (addresses.length === 0) {
    list.innerHTML = '<p style="color:var(--gray);font-size:14px;padding:12px 0">Nenhum endereço salvo.</p>';
    return;
  }
  list.innerHTML = addresses.map((a, i) => `
    <div class="order-card">
      <div class="order-header">
        <span class="order-id">${a.label || 'Endereço'}</span>
        <button class="btn btn-sm btn-outline" onclick="removeAddress(${i})">Excluir</button>
      </div>
      <div class="order-items">${a.street}, ${a.number}${a.complement ? ' - ' + a.complement : ''}<br>${a.neighborhood} · ${a.city}/${a.state}<br>CEP ${a.cep || '—'}</div>
    </div>
  `).join('');
}

function addAddress(event) {
  event.preventDefault();
  const addr = {
    label: document.getElementById('addr-label').value.trim() || 'Casa',
    cep: document.getElementById('addr-cep').value.trim(),
    street: document.getElementById('addr-street').value.trim(),
    number: document.getElementById('addr-number').value.trim(),
    complement: document.getElementById('addr-complement').value.trim(),
    neighborhood: document.getElementById('addr-neighborhood').value.trim(),
    city: document.getElementById('addr-city').value.trim() || 'São Paulo',
    state: document.getElementById('addr-state').value.trim() || 'SP'
  };
  if (!addr.street || !addr.number) {
    alert('Preencha rua e número.');
    return;
  }
  const list = getAddresses();
  list.push(addr);
  saveAddresses(list);
  document.getElementById('address-form').reset();
  renderAddressList();
}

function removeAddress(index) {
  const list = getAddresses();
  list.splice(index, 1);
  saveAddresses(list);
  renderAddressList();
}

function renderNotifPrefs() {
  const prefs = JSON.parse(localStorage.getItem('farmgo_notifs') || '{"orders":true,"promo":true}');
  const o = document.getElementById('notif-orders');
  const p = document.getElementById('notif-promo');
  if (o) o.checked = !!prefs.orders;
  if (p) p.checked = !!prefs.promo;
}

function saveNotifPrefs() {
  const prefs = {
    orders: document.getElementById('notif-orders')?.checked ?? true,
    promo: document.getElementById('notif-promo')?.checked ?? true
  };
  localStorage.setItem('farmgo_notifs', JSON.stringify(prefs));
  const msg = document.getElementById('notif-msg');
  if (msg) {
    msg.style.display = 'block';
    msg.textContent = 'Preferências salvas!';
    setTimeout(() => { msg.style.display = 'none'; }, 1500);
  }
}

async function checkSession() {
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (session) {
    updateProfileUI();
    // Se biometria ativa, não entra no app até desbloquear
    const cfg = getBiometricConfig();
    if (cfg && cfg.credentialId && !biometricUnlocked) {
      showScreen('login');
      updateBiometricButton();
      const err = document.getElementById('login-error');
      if (err) {
        err.style.display = 'block';
        err.style.color = '';
        err.textContent = 'Use a digital ou a senha de 6 dígitos para continuar.';
      }
    }
  }
  // remove storage inseguro antigo
  if (localStorage.getItem('farmgo_webauthn')) {
    localStorage.removeItem('farmgo_webauthn');
  }
}

// ==================== CART ====================
let cart = [];
let qty = 1;

function loadCart() {
  try {
    cart = JSON.parse(localStorage.getItem('farmgo_cart') || '[]');
  } catch {
    cart = [];
  }
}

function persistCart() {
  localStorage.setItem('farmgo_cart', JSON.stringify(cart));
}

function addToCart(name, price) {
  const existing = cart.find(item => item.name === name);
  if (existing) {
    existing.qty += 1;
  } else {
    cart.push({ name, price, qty: 1 });
  }
  persistCart();
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
  persistCart();
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
    (p.needsRx ? '<span class="tag" style="background:#FEF3C7;color:#D97706">Com receita</span>' : '<span class="tag">Sem receita</span>');

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

// ==================== ORDERS STORE ====================
function getOrders() {
  try {
    return JSON.parse(localStorage.getItem('farmgo_orders') || '[]');
  } catch {
    return [];
  }
}

function saveOrders(orders) {
  localStorage.setItem('farmgo_orders', JSON.stringify(orders));
}

function getPrescriptions() {
  try {
    return JSON.parse(localStorage.getItem('farmgo_prescriptions') || '[]');
  } catch {
    return [];
  }
}

function savePrescriptions(list) {
  localStorage.setItem('farmgo_prescriptions', JSON.stringify(list));
}

let currentTrackId = null;
let ordersListMode = 'active';

function fmtMoney(n) {
  return 'R$ ' + Number(n).toFixed(2).replace('.', ',');
}

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

  const profile = getLocalProfile() || {};
  const subtotal = cart.reduce((s, i) => s + i.price * i.qty, 0);
  const freight = getFreight();
  const discount = getDiscount(subtotal);
  const total = Math.max(0, subtotal + freight - discount);
  const pay = document.querySelector('input[name="payment"]:checked');
  const payment = pay ? pay.value : 'pix';

  const address = {
    cep: document.getElementById('co-cep')?.value || '',
    street: street.value.trim(),
    number: number.value.trim(),
    complement: document.getElementById('co-complement')?.value || '',
    neighborhood: document.getElementById('co-neighborhood')?.value || '',
    city: document.getElementById('co-city')?.value || 'São Paulo',
    state: document.getElementById('co-state')?.value || 'SP'
  };

  const id = String(Math.floor(10000 + Math.random() * 90000));
  const now = new Date();
  const order = {
    id,
    items: cart.map(i => ({ ...i })),
    subtotal,
    freight,
    discount,
    total,
    payment,
    coupon: appliedCoupon ? appliedCoupon.code : null,
    address,
    customerName: profile.name || 'Cliente',
    customerPhone: profile.phone || '',
    customerEmail: profile.email || '',
    status: 'confirmed', // confirmed | preparing | out | delivered
    driver: null,
    createdAt: now.toISOString(),
    timeline: [
      { key: 'confirmed', label: 'Pedido confirmado', at: now.toISOString() },
      { key: 'preparing', label: 'Farmácia separando', at: null },
      { key: 'out', label: 'Saiu para entrega', at: null },
      { key: 'delivered', label: 'Entregue', at: null }
    ]
  };

  const orders = getOrders();
  orders.unshift(order);
  saveOrders(orders);

  localStorage.setItem('farmgo_has_ordered', '1');
  appliedCoupon = null;
  const couponInput = document.getElementById('co-coupon');
  if (couponInput) couponInput.value = '';
  cart = [];
  persistCart();
  updateCartUI();
  updateFirstPurchaseUI();

  // Simula progresso da farmácia
  setTimeout(() => advanceOrderStatus(id, 'preparing'), 4000);
  setTimeout(() => advanceOrderStatus(id, 'out'), 10000);

  openTracking(id);
}

function advanceOrderStatus(orderId, status) {
  const orders = getOrders();
  const order = orders.find(o => o.id === orderId);
  if (!order || order.status === 'delivered') return;
  order.status = status;
  const now = new Date().toISOString();
  order.timeline.forEach(t => {
    if (t.key === status && !t.at) t.at = now;
    // mark previous as done times
    const order_keys = ['confirmed', 'preparing', 'out', 'delivered'];
    const idx = order_keys.indexOf(status);
    order_keys.slice(0, idx + 1).forEach(k => {
      const step = order.timeline.find(x => x.key === k);
      if (step && !step.at) step.at = now;
    });
  });
  if (status === 'out' && !order.driver) {
    order.driver = { name: 'Carlos Silva', phone: '(11) 98888-0000', rating: 4.9 };
  }
  saveOrders(orders);
  if (currentTrackId === orderId) renderTracking(orderId);
  refreshPharmacyFromOrders();
  refreshDriverFromOrders();
}

// ==================== MAPA (Leaflet + OpenStreetMap) ====================
let trackMap = null;
let trackMarkers = { pharmacy: null, driver: null, customer: null };
let trackRouteLine = null;
let driverAnimTimer = null;

const DEFAULT_PHARMACY = { lat: -23.561414, lng: -46.655881 }; // Av. Paulista
const DEFAULT_CUSTOMER = { lat: -23.5575, lng: -46.6625 };

function createMapIcon(emoji, bg) {
  return L.divIcon({
    className: 'farmgo-marker',
    html: `<div style="
      background:${bg};
      width:36px;height:36px;border-radius:50%;
      display:flex;align-items:center;justify-content:center;
      font-size:18px;border:2px solid #fff;
      box-shadow:0 2px 8px rgba(0,0,0,.25);">${emoji}</div>`,
    iconSize: [36, 36],
    iconAnchor: [18, 18]
  });
}

function ensureTrackMap() {
  const el = document.getElementById('track-map');
  if (!el || typeof L === 'undefined') return null;

  if (trackMap) {
    setTimeout(() => trackMap.invalidateSize(), 100);
    return trackMap;
  }

  trackMap = L.map(el, {
    zoomControl: true,
    attributionControl: true
  }).setView([DEFAULT_PHARMACY.lat, DEFAULT_PHARMACY.lng], 14);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap'
  }).addTo(trackMap);

  setTimeout(() => trackMap.invalidateSize(), 200);
  return trackMap;
}

async function geocodeAddress(address) {
  if (!address) return null;
  const q = [address.street, address.number, address.neighborhood, address.city, address.state, 'Brasil']
    .filter(Boolean)
    .join(', ');
  const cacheKey = 'farmgo_geo_' + q;
  try {
    const cached = sessionStorage.getItem(cacheKey);
    if (cached) return JSON.parse(cached);
  } catch (_) {}

  try {
    const url =
      'https://nominatim.openstreetmap.org/search?format=json&limit=1&q=' +
      encodeURIComponent(q);
    const res = await fetch(url, {
      headers: { Accept: 'application/json' }
    });
    const data = await res.json();
    if (data && data[0]) {
      const point = { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
      try {
        sessionStorage.setItem(cacheKey, JSON.stringify(point));
      } catch (_) {}
      return point;
    }
  } catch (e) {
    console.warn('geocode:', e);
  }
  return null;
}

function clearDriverAnimation() {
  if (driverAnimTimer) {
    clearInterval(driverAnimTimer);
    driverAnimTimer = null;
  }
}

function animateDriver(from, to, durationMs) {
  clearDriverAnimation();
  if (!trackMarkers.driver || !from || !to) return;

  const start = Date.now();
  driverAnimTimer = setInterval(() => {
    const t = Math.min(1, (Date.now() - start) / durationMs);
    const lat = from.lat + (to.lat - from.lat) * t;
    const lng = from.lng + (to.lng - from.lng) * t;
    trackMarkers.driver.setLatLng([lat, lng]);
    if (t >= 1) clearDriverAnimation();
  }, 200);
}

async function updateTrackingMap(order) {
  const hint = document.getElementById('track-map-hint');
  const map = ensureTrackMap();
  if (!map) {
    if (hint) hint.textContent = 'Mapa indisponível offline.';
    return;
  }

  if (hint) hint.textContent = 'Localizando no mapa…';

  const pharmacy = DEFAULT_PHARMACY;
  let customer = await geocodeAddress(order.address);
  if (!customer) {
    // offset demo near pharmacy if geocode fails
    customer = {
      lat: DEFAULT_CUSTOMER.lat,
      lng: DEFAULT_CUSTOMER.lng
    };
  }

  // Remove old layers
  ['pharmacy', 'driver', 'customer'].forEach(k => {
    if (trackMarkers[k]) {
      map.removeLayer(trackMarkers[k]);
      trackMarkers[k] = null;
    }
  });
  if (trackRouteLine) {
    map.removeLayer(trackRouteLine);
    trackRouteLine = null;
  }
  clearDriverAnimation();

  trackMarkers.pharmacy = L.marker([pharmacy.lat, pharmacy.lng], {
    icon: createMapIcon('💊', '#F97316')
  })
    .addTo(map)
    .bindPopup('Farmácia');

  trackMarkers.customer = L.marker([customer.lat, customer.lng], {
    icon: createMapIcon('🏠', '#2563EB')
  })
    .addTo(map)
    .bindPopup(
      order.address
        ? `${order.address.street}, ${order.address.number}`
        : 'Endereço de entrega'
    );

  const bounds = L.latLngBounds([
    [pharmacy.lat, pharmacy.lng],
    [customer.lat, customer.lng]
  ]);

  // Driver position by status
  if (order.status === 'out' || order.status === 'delivered') {
    let driverPos;
    if (order.status === 'delivered') {
      driverPos = customer;
    } else {
      // midpoint + slight offset, then animate toward customer
      driverPos = {
        lat: pharmacy.lat + (customer.lat - pharmacy.lat) * 0.45,
        lng: pharmacy.lng + (customer.lng - pharmacy.lng) * 0.45
      };
    }
    trackMarkers.driver = L.marker([driverPos.lat, driverPos.lng], {
      icon: createMapIcon('🏍️', '#10B981')
    })
      .addTo(map)
      .bindPopup(order.driver?.name || 'Entregador');

    trackRouteLine = L.polyline(
      [
        [pharmacy.lat, pharmacy.lng],
        [driverPos.lat, driverPos.lng],
        [customer.lat, customer.lng]
      ],
      { color: '#F97316', weight: 4, opacity: 0.85, dashArray: '8 8' }
    ).addTo(map);

    bounds.extend([driverPos.lat, driverPos.lng]);

    if (order.status === 'out') {
      animateDriver(driverPos, customer, 45000);
    }
  } else {
    trackRouteLine = L.polyline(
      [
        [pharmacy.lat, pharmacy.lng],
        [customer.lat, customer.lng]
      ],
      { color: '#F97316', weight: 3, opacity: 0.5, dashArray: '6 10' }
    ).addTo(map);
  }

  map.fitBounds(bounds.pad(0.25));
  setTimeout(() => map.invalidateSize(), 150);

  if (hint) {
    if (order.status === 'out') hint.textContent = 'Motorista a caminho · mapa ao vivo';
    else if (order.status === 'delivered') hint.textContent = 'Pedido entregue neste endereço';
    else if (order.status === 'preparing') hint.textContent = 'Farmácia preparando · rota até você';
    else hint.textContent = 'Pedido confirmado · aguardando separação';
  }
}

function openTracking(orderId) {

  currentTrackId = orderId;
  renderTracking(orderId);
  showScreen('tracking');
}

function renderTracking(orderId) {
  const order = getOrders().find(o => o.id === orderId);
  if (!order) return;

  const title = document.getElementById('track-order-id');
  const st = document.getElementById('track-status-title');
  const sub = document.getElementById('track-status-sub');
  const steps = document.getElementById('track-steps');
  const driverName = document.getElementById('track-driver-name');

  if (title) title.textContent = 'Pedido #' + order.id;

  const labels = {
    confirmed: 'Pedido confirmado',
    preparing: 'Farmácia separando',
    out: 'Saiu para entrega',
    delivered: 'Entregue'
  };
  if (st) st.textContent = labels[order.status] || order.status;
  if (sub) {
    if (order.status === 'delivered') sub.textContent = 'Pedido entregue com sucesso';
    else if (order.status === 'out') sub.textContent = 'Chegada estimada em poucos minutos';
    else sub.textContent = 'Acompanhe o status abaixo';
  }

  if (steps) {
    const order_keys = ['confirmed', 'preparing', 'out', 'delivered'];
    const cur = order_keys.indexOf(order.status);
    steps.innerHTML = order.timeline.map((t, i) => {
      let cls = 't-step';
      if (i < cur) cls += ' done';
      if (i === cur) cls += ' active done';
      const time = t.at ? new Date(t.at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '—';
      return `<div class="${cls}"><div class="t-dot"></div><div><strong>${t.label}</strong><span>${time}</span></div></div>`;
    }).join('');
  }

  if (driverName) {
    driverName.textContent = order.driver ? order.driver.name : 'Aguardando motorista';
  }

  const addrLabel = document.getElementById('cart-address-label');
  if (addrLabel && order.address) {
    addrLabel.textContent = order.address.street + ', ' + order.address.number;
  }

  updateTrackingMap(order);
}

function renderOrdersList(mode, btn) {
  if (mode) ordersListMode = mode;
  if (btn) {
    document.querySelectorAll('#orders .tab').forEach(t => t.classList.remove('active'));
    btn.classList.add('active');
  }
  const list = document.getElementById('orders-list');
  if (!list) return;

  const orders = getOrders();
  const filtered = orders.filter(o => {
    if (ordersListMode === 'done') return o.status === 'delivered';
    return o.status !== 'delivered';
  });

  if (filtered.length === 0) {
    list.innerHTML = '<div class="empty-state" style="padding:40px 20px"><i class="fas fa-box-open"></i><h3>Nenhum pedido</h3><p>Seus pedidos aparecerão aqui</p><button class="btn btn-primary" onclick="showScreen(\'search\')">Pedir agora</button></div>';
    return;
  }

  const statusLabel = {
    confirmed: 'Confirmado',
    preparing: 'Preparando',
    out: 'A caminho',
    delivered: 'Entregue'
  };

  list.innerHTML = filtered.map(o => {
    const items = o.items.map(i => i.name + (i.qty > 1 ? ' ×' + i.qty : '')).join(' · ');
    const when = new Date(o.createdAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    const stClass = o.status === 'delivered' ? 'done' : 'active';
    return `<div class="order-card" onclick="openTracking('${o.id}')">
      <div class="order-header">
        <span class="order-id">#${o.id}</span>
        <span class="order-status ${stClass}">${statusLabel[o.status] || o.status}</span>
      </div>
      <div class="order-items">${items}</div>
      <div class="order-footer">
        <span>${when}</span>
        <strong>${fmtMoney(o.total)}</strong>
      </div>
    </div>`;
  }).join('');
}

function removeRx() {
  const preview = document.getElementById('rx-preview');
  if (preview) preview.classList.add('hidden');
  const file = document.getElementById('rx-file');
  if (file) file.value = '';
  const status = document.querySelector('.rx-status');
  if (status) {
    status.innerHTML = '<i class="fas fa-spinner fa-spin"></i> <span>Validando com farmacêutico...</span>';
  }
}

function handleRxUpload() {
  const file = document.getElementById('rx-file').files[0];
  if (!file) return;

  document.getElementById('rx-name').textContent = file.name;
  document.getElementById('rx-preview').classList.remove('hidden');

  const list = getPrescriptions();
  list.unshift({
    id: Date.now().toString(),
    name: file.name,
    status: 'validating',
    createdAt: new Date().toISOString()
  });
  savePrescriptions(list);

  setTimeout(() => {
    const status = document.querySelector('.rx-status');
    if (status) {
      status.innerHTML =
        '<i class="fas fa-check-circle" style="color:#10B981"></i> <span style="color:#059669">Receita validada! Você já pode pedir os medicamentos.</span>';
    }
    const prescriptions = getPrescriptions();
    if (prescriptions[0]) {
      prescriptions[0].status = 'validated';
      savePrescriptions(prescriptions);
    }
    renderRxHistory();
  }, 2000);
}

function renderRxHistory() {
  const el = document.getElementById('rx-history');
  if (!el) return;
  const list = getPrescriptions();
  if (list.length === 0) {
    el.innerHTML = '<p style="font-size:13px;color:var(--gray)">Nenhuma receita enviada ainda.</p>';
    return;
  }
  el.innerHTML = list.slice(0, 10).map(r => {
    const st = r.status === 'validated' ? 'Validada' : 'Em análise';
    const cls = r.status === 'validated' ? 'done' : 'active';
    const when = new Date(r.createdAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    return `<div class="order-card"><div class="order-header"><span class="order-id">${r.name}</span><span class="order-status ${cls}">${st}</span></div><div class="order-footer"><span>${when}</span></div></div>`;
  }).join('');
}

function refreshPharmacyFromOrders() {
  const orders = getOrders().filter(o => o.status !== 'delivered');
  const container = document.getElementById('pharm-tab-pedidos');
  if (!container) return;

  const pending = orders.length;
  const revToday = getOrders()
    .filter(o => {
      const d = new Date(o.createdAt);
      const n = new Date();
      return d.toDateString() === n.toDateString();
    })
    .reduce((s, o) => s + o.total, 0);

  const elOrders = document.getElementById('pharm-orders-today');
  const elRev = document.getElementById('pharm-revenue');
  const elPend = document.getElementById('pharm-pending');
  if (elOrders) elOrders.textContent = String(getOrders().filter(o => new Date(o.createdAt).toDateString() === new Date().toDateString()).length || 0);
  if (elRev) elRev.textContent = fmtMoney(revToday || 0);
  if (elPend) elPend.textContent = String(pending);

  if (orders.length === 0) {
    // keep static demo if empty - or show empty
    return;
  }

  const statusLabel = { confirmed: 'Novo', preparing: 'Separar', out: 'Em rota', delivered: 'Entregue' };
  let html = '<h3 class="section-title-sm">Pedidos em andamento</h3>';
  html += orders.slice(0, 8).map(o => {
    const items = o.items.map(i => i.name + ' ×' + i.qty).join(' · ');
    return `<div class="order-card">
      <div class="order-header">
        <span class="order-id">#${o.id}</span>
        <span class="order-status active">${statusLabel[o.status] || o.status}</span>
      </div>
      <div class="order-items">${items}</div>
      <div class="order-footer">
        <span>${o.customerName || 'Cliente'}</span>
        ${o.status === 'confirmed' || o.status === 'preparing'
          ? `<button class="btn btn-sm btn-primary" onclick="pharmacyConfirmOrder('${o.id}')">Confirmar</button>`
          : `<button class="btn btn-sm btn-outline" onclick="openTracking('${o.id}')">Ver</button>`}
      </div>
    </div>`;
  }).join('');
  container.innerHTML = html;
}

function pharmacyConfirmOrder(id) {
  advanceOrderStatus(id, 'preparing');
  setTimeout(() => advanceOrderStatus(id, 'out'), 3000);
  refreshPharmacyFromOrders();
}

function refreshDriverFromOrders() {
  const out = getOrders().filter(o => o.status === 'out');
  const waiting = getOrders().filter(o => o.status === 'preparing' || o.status === 'confirmed');
  const activeEl = document.getElementById('driver-active-delivery');
  if (activeEl && out[0]) {
    const o = out[0];
    const items = o.items.map(i => i.name).join(' · ');
    const addr = o.address ? `${o.address.street}, ${o.address.number}` : 'Endereço';
    activeEl.innerHTML = `
      <div class="order-header">
        <span class="order-id">#${o.id}</span>
        <span class="order-status active">Em rota</span>
      </div>
      <div class="order-items">${items}</div>
      <div style="font-size:13px;color:var(--gray);margin:8px 0">
        <div><i class="fas fa-map-marker-alt" style="color:var(--primary);width:18px"></i> ${addr}</div>
        <div style="margin-top:4px"><i class="fas fa-user" style="width:18px"></i> ${o.customerName || 'Cliente'}</div>
      </div>
      <div class="order-footer" style="gap:8px;flex-wrap:wrap">
        <button class="btn btn-sm btn-outline" onclick="alert('Ligando...')"><i class="fas fa-phone"></i> Ligar</button>
        <button class="btn btn-sm btn-primary" onclick="driverMarkDelivered('${o.id}')">Marcar entregue</button>
      </div>`;
  }
  const activeStat = document.getElementById('driver-stat-active');
  if (activeStat) activeStat.textContent = String(out.length);
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

  document.querySelectorAll('#home .med-card[data-cat]').forEach(card => {
    const cats = (card.getAttribute('data-cat') || '').split(/\s+/);
    const show = cat === 'todos' || cats.includes(cat);
    card.style.display = show ? 'flex' : 'none';
  });

  if (cat !== 'todos') {
    showScreen('search');
    document.querySelectorAll('#search-results .med-card').forEach(card => {
      const cats = (card.getAttribute('data-cat') || '').split(/\s+/);
      card.style.display = cats.includes(cat) ? 'flex' : 'none';
    });
  }
}

function applySearchFilter(type, btn) {
  document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
  if (btn) btn.classList.add('active');
  const cards = document.querySelectorAll('#search-results .med-card');
  cards.forEach(card => {
    const cats = (card.getAttribute('data-cat') || '');
    const text = card.innerText.toLowerCase();
    let show = true;
    if (type === 'receita') show = text.includes('receita');
    else if (type === 'genericos') show = cats.includes('genericos');
    else if (type === 'baratos') {
      const priceEl = card.querySelector('.price');
      const p = priceEl ? parseFloat(priceEl.textContent.replace(/[^\d,]/g, '').replace(',', '.')) : 999;
      show = p <= 20;
    }
    card.style.display = show ? 'flex' : 'none';
  });
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

// Override driver mark delivered to use orders store
function driverMarkDelivered(orderId) {
  advanceOrderStatus(orderId, 'delivered');
  const card = document.getElementById('driver-active-delivery');
  if (card) {
    card.innerHTML =
      '<div class="order-header"><span class="order-id">#' +
      orderId +
      '</span><span class="order-status done">Entregue</span></div>' +
      '<div class="order-items">Entrega concluída com sucesso!</div>';
  }
  const done = document.getElementById('driver-stat-done');
  if (done) done.textContent = String(Number(done.textContent || 0) + 1);
  refreshDriverFromOrders();
}

function driverStartDelivery(orderId) {
  advanceOrderStatus(orderId, 'out');
  alert('Entrega #' + orderId + ' iniciada!');
  refreshDriverFromOrders();
}

// ==================== INIT ====================
document.addEventListener('DOMContentLoaded', () => {
  loadCart();
  updateCartUI();
  updateCartBadges();
  checkSession();
  updateFirstPurchaseUI();
  updateBiometricButton();
  updateProfileUI();

  document.querySelectorAll('.payment-option').forEach(opt => {
    opt.addEventListener('click', () => {
      document.querySelectorAll('.payment-option').forEach(o => o.classList.remove('selected'));
      opt.classList.add('selected');
      const input = opt.querySelector('input');
      if (input) input.checked = true;
    });
  });
});
