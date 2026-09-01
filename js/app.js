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
  if (id === 'profile-notifs') renderNotifPrefs();
  if (id === 'notifications') renderNotificationsList();
  if (id === 'orders') renderOrdersList('active');
  if (id === 'tracking' && trackMap) setTimeout(() => trackMap.invalidateSize(), 200);
  if (id === 'prescription') renderRxHistory();
  if (id === 'pharmacy-dashboard') {
    ensurePharmacyCatalog();
    refreshPharmacyFromOrders();
    renderPharmacyMedicines();
    renderPharmacyStock();
    renderPharmacySales();
  }
  if (id === 'driver-dashboard') refreshDriverFromOrders();
  if (id === 'checkout') { prepareCheckout(); updateTotals(); }
  if (id === 'cart') updateTotals();
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
  ['pedidos', 'remedios', 'estoque', 'vendas', 'motoristas'].forEach(t => {
    const el = document.getElementById('pharm-tab-' + t);
    if (el) el.style.display = t === tab ? 'block' : 'none';
  });
  document.querySelectorAll('#pharmacy-dashboard .tab').forEach(t => t.classList.remove('active'));
  if (btn) btn.classList.add('active');
  if (tab === 'remedios') renderPharmacyMedicines();
  if (tab === 'estoque') renderPharmacyStock();
  if (tab === 'vendas') renderPharmacySales();
  if (tab === 'pedidos') refreshPharmacyFromOrders();
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

function getNotifPrefs() {
  try {
    return JSON.parse(
      localStorage.getItem('farmgo_notifs') ||
        '{"orders":true,"promo":true,"push":true}'
    );
  } catch {
    return { orders: true, promo: true, push: true };
  }
}

function renderNotifPrefs() {
  const prefs = getNotifPrefs();
  const o = document.getElementById('notif-orders');
  const p = document.getElementById('notif-promo');
  const push = document.getElementById('notif-push');
  if (o) o.checked = !!prefs.orders;
  if (p) p.checked = !!prefs.promo;
  if (push) push.checked = prefs.push !== false;
  updatePushPermissionStatus();
}

function saveNotifPrefs() {
  const prefs = {
    orders: document.getElementById('notif-orders')?.checked ?? true,
    promo: document.getElementById('notif-promo')?.checked ?? true,
    push: document.getElementById('notif-push')?.checked ?? true
  };
  localStorage.setItem('farmgo_notifs', JSON.stringify(prefs));
  const msg = document.getElementById('notif-msg');
  if (msg) {
    msg.style.display = 'block';
    msg.textContent = 'Preferências salvas!';
    setTimeout(() => {
      msg.style.display = 'none';
    }, 1500);
  }
  if (prefs.push) requestPushPermission(true);
}

// ==================== NOTIFICAÇÕES EM TEMPO REAL ====================
const NOTIF_KEY = 'farmgo_notifications_v1';
let notifChannel = null;
try {
  notifChannel = new BroadcastChannel('farmgo_notifs');
  notifChannel.onmessage = (ev) => {
    if (ev.data && ev.data.type === 'ORDER_STATUS') {
      handleRealtimeNotification(ev.data.payload, { skipBroadcast: true });
    }
  };
} catch (_) {}

function getNotifications() {
  try {
    return JSON.parse(localStorage.getItem(NOTIF_KEY) || '[]');
  } catch {
    return [];
  }
}

function saveNotifications(list) {
  localStorage.setItem(NOTIF_KEY, JSON.stringify(list.slice(0, 50)));
  updateNotifBadge();
}

function updateNotifBadge() {
  const unread = getNotifications().filter(n => !n.read).length;
  document.querySelectorAll('#notif-badge').forEach(b => {
    if (unread > 0) {
      b.style.display = 'flex';
      b.textContent = unread > 9 ? '9+' : String(unread);
    } else {
      b.style.display = 'none';
    }
  });
}

function showToast(title, body, onClick) {
  const box = document.getElementById('toast-container');
  if (!box) return;
  const el = document.createElement('div');
  el.className = 'toast';
  el.innerHTML =
    '<div class="toast-icon"><i class="fas fa-bell"></i></div>' +
    '<div class="toast-body"><strong></strong><span></span></div>';
  el.querySelector('strong').textContent = title;
  el.querySelector('span').textContent = body;
  el.onclick = () => {
    el.classList.add('out');
    setTimeout(() => el.remove(), 250);
    if (onClick) onClick();
  };
  box.appendChild(el);
  setTimeout(() => {
    el.classList.add('out');
    setTimeout(() => el.remove(), 250);
  }, 4500);
}

async function showSystemNotification(title, body, data) {
  const prefs = getNotifPrefs();
  if (prefs.push === false) return;
  if (!('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;

  const opts = {
    body,
    tag: data?.orderId ? 'order-' + data.orderId : 'farmgo',
    renotify: true,
    data: data || {}
  };

  try {
    if (navigator.serviceWorker && navigator.serviceWorker.ready) {
      const reg = await navigator.serviceWorker.ready;
      await reg.showNotification(title, opts);
      return;
    }
  } catch (_) {}

  try {
    const n = new Notification(title, opts);
    n.onclick = () => {
      window.focus();
      if (data?.orderId) openTracking(data.orderId);
      n.close();
    };
  } catch (_) {}
}

function updatePushPermissionStatus() {
  const el = document.getElementById('notif-perm-status');
  if (!el) return;
  if (!('Notification' in window)) {
    el.textContent = 'Este navegador não suporta notificações do sistema.';
    return;
  }
  const map = {
    granted: 'Alertas do navegador: ativados ✓',
    denied: 'Alertas bloqueados nas configurações do navegador.',
    default: 'Permissão ainda não concedida — toque em “Ativar alertas”.'
  };
  el.textContent = map[Notification.permission] || '';
}

async function requestPushPermission(silent) {
  if (!('Notification' in window)) {
    if (!silent) alert('Notificações não suportadas neste navegador.');
    return false;
  }
  try {
    const perm = await Notification.requestPermission();
    updatePushPermissionStatus();
    if (perm === 'granted') {
      await registerServiceWorker();
      if (!silent) {
        showToast('Notificações ativas', 'Você receberá alertas de status do pedido.');
        const msg = document.getElementById('notif-msg');
        if (msg) {
          msg.style.display = 'block';
          msg.textContent = 'Alertas do navegador ativados!';
        }
      }
      return true;
    }
    if (!silent && perm === 'denied') {
      alert('Permissão negada. Ative nas configurações do navegador/site.');
    }
  } catch (e) {
    console.warn(e);
  }
  return false;
}

async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return null;
  try {
    // Só registra em http(s) — file:// não funciona
    if (location.protocol === 'file:') return null;
    const reg = await navigator.serviceWorker.register('./sw.js');
    return reg;
  } catch (e) {
    console.warn('SW:', e);
    return null;
  }
}

const STATUS_NOTIF = {
  pending: {
    title: 'Pedido recebido',
    body: 'Aguardando a farmácia confirmar.'
  },
  confirmed: {
    title: 'Pedido confirmado',
    body: 'A farmácia confirmou seu pedido.'
  },
  preparing: {
    title: 'Farmácia separando',
    body: 'Seus medicamentos estão sendo separados.'
  },
  out: {
    title: 'Saiu para entrega',
    body: 'O motorista está a caminho!'
  },
  delivered: {
    title: 'Pedido entregue',
    body: 'Entrega concluída. Obrigado por usar o FarmGo!'
  }
};

function handleRealtimeNotification(payload, opts = {}) {
  const prefs = getNotifPrefs();
  if (prefs.orders === false) return;

  const { orderId, status, role } = payload;
  const msg = STATUS_NOTIF[status] || {
    title: 'Atualização do pedido',
    body: 'Status: ' + status
  };

  const item = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    title: msg.title,
    body: (orderId ? '#' + orderId + ' · ' : '') + msg.body,
    orderId: orderId || null,
    status,
    role: role || 'client',
    read: false,
    at: new Date().toISOString()
  };

  const list = getNotifications();
  list.unshift(item);
  saveNotifications(list);

  showToast(item.title, item.body, () => {
    markNotificationRead(item.id);
    if (item.orderId) openTracking(item.orderId);
  });

  showSystemNotification(item.title, item.body, {
    orderId: item.orderId,
    status
  });

  // farmácia / motorista toasts também
  if (role === 'pharmacy') {
    showToast('Novo pedido', 'Pedido #' + orderId + ' aguardando confirmação.');
  }
  if (role === 'driver' && status === 'preparing') {
    showToast('Pedido pronto', '#' + orderId + ' separado — pode sair para entrega.');
  }

  if (!opts.skipBroadcast && notifChannel) {
    try {
      notifChannel.postMessage({ type: 'ORDER_STATUS', payload });
    } catch (_) {}
  }

  // Atualiza UI se centros abertos
  if (document.getElementById('notifications')?.classList.contains('active')) {
    renderNotificationsList();
  }
}

function notifyOrderStatus(orderId, status, extra = {}) {
  handleRealtimeNotification({ orderId, status, ...extra });
}

function renderNotificationsList() {
  const el = document.getElementById('notifications-list');
  if (!el) return;
  const list = getNotifications();
  if (!list.length) {
    el.innerHTML =
      '<div class="empty-state" style="padding:40px 20px"><i class="fas fa-bell-slash"></i><h3>Nenhuma notificação</h3><p>Atualizações dos pedidos aparecem aqui em tempo real</p></div>';
    return;
  }
  el.innerHTML = list
    .map(n => {
      const when = new Date(n.at).toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      });
      return `<div class="notif-item ${n.read ? '' : 'unread'}" onclick="openNotification('${n.id}')">
        <div class="notif-item-icon"><i class="fas fa-box"></i></div>
        <div>
          <strong>${n.title}</strong>
          <p>${n.body}</p>
          <time>${when}</time>
        </div>
      </div>`;
    })
    .join('');
}

function markNotificationRead(id) {
  const list = getNotifications();
  const n = list.find(x => x.id === id);
  if (n) n.read = true;
  saveNotifications(list);
}

function openNotification(id) {
  const list = getNotifications();
  const n = list.find(x => x.id === id);
  if (!n) return;
  n.read = true;
  saveNotifications(list);
  renderNotificationsList();
  if (n.orderId) openTracking(n.orderId);
}

function clearAllNotifications() {
  saveNotifications([]);
  renderNotificationsList();
}

function notifyNewOrderToPharmacy(orderId) {
  // toast para quem estiver no painel farmácia (mesma aba)
  const dash = document.getElementById('pharmacy-dashboard');
  if (dash && dash.classList.contains('active')) {
    showToast('Novo pedido #' + orderId, 'Confirme e separe os itens.');
  }
  // grava notificação genérica
  const list = getNotifications();
  list.unshift({
    id: 'ph' + Date.now(),
    title: 'Novo pedido na farmácia',
    body: 'Pedido #' + orderId + ' aguardando confirmação.',
    orderId,
    status: 'pending',
    role: 'pharmacy',
    read: false,
    at: new Date().toISOString()
  });
  saveNotifications(list);
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

function addToCart(name, price, pharmacyId, pharmacyName) {
  const prod = Object.values(PRODUCTS).find(p => p.shortName === name || p.name === name);
  if (prod && typeof prod.stock === 'number' && prod.stock <= 0) {
    alert('Produto sem estoque no momento.');
    return;
  }

  // Se não veio farmácia, abre seletor (exceto se já tem seleção global)
  if (!pharmacyId) {
    const nearest = getNearestPharmacy();
    pharmacyId = nearest?.id;
    pharmacyName = nearest?.name;
  }

  const pharmKey = pharmacyId || 'default';
  const existing = cart.find(
    item => item.name === name && (item.pharmacyId || 'default') === pharmKey
  );
  if (existing) {
    existing.qty += 1;
  } else {
    cart.push({
      name,
      price: Number(price),
      qty: 1,
      pharmacyId: pharmacyId || null,
      pharmacyName: pharmacyName || 'Farmácia'
    });
  }
  persistCart();
  updateCartUI();
  document.querySelectorAll('.badge').forEach(b => {
    b.style.transform = 'scale(1.3)';
    setTimeout(() => (b.style.transform = 'scale(1)'), 200);
  });
}

/** Clique no + do card: abre escolha de farmácia */
function addToCartWithPharmacyChoice(name, price) {
  openPharmacyPicker(name, price);
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
            <span>${item.pharmacyName ? item.pharmacyName + ' · ' : ''}R$ ${(item.price * item.qty).toFixed(2).replace('.', ',')}</span>
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

  const cartLabel = document.getElementById('cart-address-label');
  if (cartLabel) {
    const addresses = typeof getAddresses === 'function' ? getAddresses() : [];
    if (addresses.length) {
      const a = addresses[0];
      cartLabel.textContent = (a.street || '') + ', ' + (a.number || '');
    } else {
      cartLabel.textContent = 'Informe o endereço no checkout';
    }
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

// ==================== PHARMACY CATALOG / ESTOQUE ====================
const PHARM_PRODUCTS_KEY = 'farmgo_pharmacy_products';

function getPharmacyProducts() {
  try {
    return JSON.parse(localStorage.getItem(PHARM_PRODUCTS_KEY) || '[]');
  } catch {
    return [];
  }
}

function savePharmacyProducts(list) {
  localStorage.setItem(PHARM_PRODUCTS_KEY, JSON.stringify(list));
  syncProductsToCatalog(list);
  renderCustomerCatalog();
}

function ensurePharmacyCatalog() {
  let list = getPharmacyProducts();
  if (list.length === 0 && typeof PRODUCTS !== 'undefined') {
    list = Object.values(PRODUCTS).map(p => ({
      id: p.id,
      name: p.name,
      shortName: p.shortName || p.name,
      lab: p.lab || '',
      price: p.price,
      price2: p.price2 || p.price,
      stock: 80,
      stockMin: 15,
      category: 'medicamentos',
      needsRx: !!p.needsRx,
      desc: p.desc || '',
      comp: p.comp || '',
      usage: p.usage || '',
      contra: p.contra || '',
      icon: p.icon || 'fa-pills',
      active: true,
      time: p.time || '20 min'
    }));
    // categories refinadas
    const catMap = {
      losartana: 'coracao',
      paracetamol_infantil: 'infantil',
      clonazepam: 'nervoso',
      protetor: 'beleza',
      dipirona: 'genericos',
      omeprazol: 'genericos',
      amoxicilina: 'genericos'
    };
    list.forEach(item => {
      if (catMap[item.id]) item.category = catMap[item.id];
    });
    savePharmacyProducts(list);
  } else {
    syncProductsToCatalog(list);
  }
}

function syncProductsToCatalog(list) {
  list.forEach(p => {
    PRODUCTS[p.id] = {
      id: p.id,
      name: p.name,
      shortName: p.shortName || p.name,
      lab: p.lab,
      price: Number(p.price),
      price2: Number(p.price2 || p.price),
      icon: p.icon || 'fa-pills',
      iconClass: '',
      needsRx: !!p.needsRx,
      time: p.time || '20 min',
      desc: p.desc || '',
      comp: p.comp || '',
      usage: p.usage || '',
      contra: p.contra || '',
      stock: p.stock,
      category: p.category,
      active: p.active !== false
    };
  });
}

function slugifyMed(name) {
  return (
    name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '')
      .slice(0, 40) || 'med_' + Date.now()
  );
}

function openMedicineForm(id) {
  const wrap = document.getElementById('pharm-med-form-wrap');
  if (!wrap) return;
  wrap.style.display = 'block';
  document.getElementById('pharm-med-form-title').textContent = id ? 'Editar remédio' : 'Novo remédio';
  document.getElementById('med-edit-id').value = id || '';

  if (id) {
    const p = getPharmacyProducts().find(x => x.id === id);
    if (p) {
      document.getElementById('med-name').value = p.name || '';
      document.getElementById('med-lab').value = p.lab || '';
      document.getElementById('med-price').value = p.price;
      document.getElementById('med-price2').value = p.price2 || '';
      document.getElementById('med-stock').value = p.stock ?? 0;
      document.getElementById('med-stock-min').value = p.stockMin ?? 10;
      document.getElementById('med-category').value = p.category || 'medicamentos';
      document.getElementById('med-needs-rx').checked = !!p.needsRx;
      document.getElementById('med-desc').value = p.desc || '';
      document.getElementById('med-comp').value = p.comp || '';
      document.getElementById('med-usage').value = p.usage || '';
      document.getElementById('med-contra').value = p.contra || '';
      document.getElementById('med-active').checked = p.active !== false;
    }
  } else {
    document.getElementById('pharm-med-form').reset();
    document.getElementById('med-edit-id').value = '';
    document.getElementById('med-stock').value = 50;
    document.getElementById('med-stock-min').value = 10;
    document.getElementById('med-active').checked = true;
  }
  wrap.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function closeMedicineForm() {
  const wrap = document.getElementById('pharm-med-form-wrap');
  if (wrap) wrap.style.display = 'none';
}

function savePharmacyMedicine(event) {
  event.preventDefault();
  const editId = document.getElementById('med-edit-id').value;
  const name = document.getElementById('med-name').value.trim();
  const price = parseFloat(document.getElementById('med-price').value);
  if (!name || isNaN(price)) {
    alert('Nome e preço são obrigatórios.');
    return;
  }

  const list = getPharmacyProducts();
  const payload = {
    id: editId || slugifyMed(name) + '_' + Date.now().toString(36),
    name,
    shortName: name.split(' ').slice(0, 3).join(' '),
    lab: document.getElementById('med-lab').value.trim(),
    price,
    price2: parseFloat(document.getElementById('med-price2').value) || price,
    stock: parseInt(document.getElementById('med-stock').value, 10) || 0,
    stockMin: parseInt(document.getElementById('med-stock-min').value, 10) || 0,
    category: document.getElementById('med-category').value,
    needsRx: document.getElementById('med-needs-rx').checked,
    desc: document.getElementById('med-desc').value.trim(),
    comp: document.getElementById('med-comp').value.trim(),
    usage: document.getElementById('med-usage').value.trim(),
    contra: document.getElementById('med-contra').value.trim(),
    icon: 'fa-pills',
    active: document.getElementById('med-active').checked,
    time: '20 min'
  };

  const idx = list.findIndex(x => x.id === payload.id);
  if (idx >= 0) list[idx] = { ...list[idx], ...payload };
  else list.unshift(payload);

  savePharmacyProducts(list);
  closeMedicineForm();
  renderPharmacyMedicines();
  renderPharmacyStock();
  alert('Remédio salvo e ' + (payload.active ? 'publicado no app!' : 'salvo como rascunho.'));
}

function deletePharmacyMedicine(id) {
  if (!confirm('Remover este remédio do catálogo?')) return;
  const list = getPharmacyProducts().filter(x => x.id !== id);
  savePharmacyProducts(list);
  if (PRODUCTS[id]) delete PRODUCTS[id];
  renderPharmacyMedicines();
  renderPharmacyStock();
  renderCustomerCatalog();
}

function renderPharmacyMedicines() {
  const el = document.getElementById('pharm-med-list');
  if (!el) return;
  ensurePharmacyCatalog();
  const q = (document.getElementById('pharm-med-search')?.value || '').toLowerCase();
  let list = getPharmacyProducts();
  if (q) list = list.filter(p => (p.name + p.lab).toLowerCase().includes(q));

  if (list.length === 0) {
    el.innerHTML = '<p style="color:var(--gray);font-size:14px">Nenhum remédio. Clique em Novo para cadastrar.</p>';
    return;
  }

  el.innerHTML = list
    .map(p => {
      const pub = p.active !== false;
      return `<div class="order-card">
        <div class="order-header">
          <span class="order-id">${p.name}</span>
          <span class="order-status ${pub ? 'done' : ''}">${pub ? 'No app' : 'Oculto'}</span>
        </div>
        <div class="order-items">${p.lab || '—'} · R$ ${Number(p.price).toFixed(2).replace('.', ',')} · Est: ${p.stock}</div>
        <div class="order-footer" style="gap:6px;flex-wrap:wrap">
          <button class="btn btn-sm btn-outline" onclick="openMedicineForm('${p.id}')">Editar</button>
          <button class="btn btn-sm btn-outline" onclick="toggleMedicineActive('${p.id}')">${pub ? 'Ocultar' : 'Publicar'}</button>
          <button class="btn btn-sm btn-outline" style="color:var(--danger)" onclick="deletePharmacyMedicine('${p.id}')">Excluir</button>
        </div>
      </div>`;
    })
    .join('');
}

function toggleMedicineActive(id) {
  const list = getPharmacyProducts();
  const p = list.find(x => x.id === id);
  if (!p) return;
  p.active = p.active === false;
  savePharmacyProducts(list);
  renderPharmacyMedicines();
}

function adjustStock(id, delta) {
  const list = getPharmacyProducts();
  const p = list.find(x => x.id === id);
  if (!p) return;
  p.stock = Math.max(0, (parseInt(p.stock, 10) || 0) + delta);
  savePharmacyProducts(list);
  renderPharmacyStock();
  renderPharmacyMedicines();
}

function setStock(id, value) {
  const list = getPharmacyProducts();
  const p = list.find(x => x.id === id);
  if (!p) return;
  p.stock = Math.max(0, parseInt(value, 10) || 0);
  savePharmacyProducts(list);
  renderPharmacyStock();
}

function renderPharmacyStock() {
  const el = document.getElementById('pharm-stock-list');
  if (!el) return;
  ensurePharmacyCatalog();
  const list = getPharmacyProducts();
  if (!list.length) {
    el.innerHTML = '<p style="color:var(--gray)">Cadastre remédios na aba Remédios.</p>';
    return;
  }
  el.innerHTML = list
    .map(p => {
      const stock = parseInt(p.stock, 10) || 0;
      const min = parseInt(p.stockMin, 10) || 0;
      let status = 'OK';
      let style = 'done';
      if (stock <= 0) {
        status = 'Zerado';
        style = '';
      } else if (stock <= min * 0.5) {
        status = 'Crítico';
        style = '';
      } else if (stock <= min) {
        status = 'Baixo';
        style = '';
      }
      const badgeStyle =
        status === 'OK'
          ? ''
          : status === 'Baixo'
            ? 'style="background:#FEF3C7;color:#D97706"'
            : 'style="background:#FEE2E2;color:#DC2626"';
      return `<div class="order-card">
        <div class="order-header">
          <span class="order-id">${p.name}</span>
          <span class="order-status ${style}" ${badgeStyle}>${status}</span>
        </div>
        <div class="order-footer" style="flex-wrap:wrap;gap:8px">
          <span>Mín: ${min}</span>
          <div class="qty-selector">
            <button type="button" onclick="adjustStock('${p.id}', -1)">−</button>
            <input type="number" value="${stock}" min="0" style="width:52px;text-align:center;border:none;font-weight:600" onchange="setStock('${p.id}', this.value)">
            <button type="button" onclick="adjustStock('${p.id}', 1)">+</button>
          </div>
        </div>
      </div>`;
    })
    .join('');
}

function requestRestock() {
  const low = getPharmacyProducts().filter(p => (p.stock || 0) <= (p.stockMin || 0));
  if (!low.length) {
    alert('Nenhum item abaixo do mínimo.');
    return;
  }
  alert('Reposição solicitada para:\\n' + low.map(p => '• ' + p.name + ' (est. ' + p.stock + ')').join('\\n'));
}

function renderPharmacySales() {
  const orders = getOrders();
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfWeek = new Date(startOfDay);
  startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const sum = (from) =>
    orders.filter(o => new Date(o.createdAt) >= from).reduce((s, o) => s + (o.total || 0), 0);

  const today = sum(startOfDay);
  const week = sum(startOfWeek);
  const month = sum(startOfMonth);
  const fee = month * 0.12;
  const net = month - fee;
  const fmt = n => 'R$ ' + n.toFixed(2).replace('.', ',');

  const set = (id, v) => {
    const el = document.getElementById(id);
    if (el) el.textContent = v;
  };
  set('pharm-sales-today', fmt(today));
  set('pharm-sales-week', fmt(week));
  set('pharm-sales-month', fmt(month));
  set('pharm-sales-fee', '- ' + fmt(fee));
  set('pharm-sales-net', fmt(net));
  const cat = document.getElementById('pharm-catalog-count');
  if (cat) {
    const n = getPharmacyProducts().filter(p => p.active !== false).length;
    cat.textContent = n + ' produto' + (n === 1 ? '' : 's') + ' publicado' + (n === 1 ? '' : 's');
  }
}

function medCardHtml(p) {
  const price = Number(p.price).toFixed(2).replace('.', ',');
  const cats = [p.category || 'medicamentos', p.needsRx ? '' : 'genericos'].filter(Boolean).join(' ');
  const rx = p.needsRx ? ' · <span class="badge-rx">Receita</span>' : '';
  return `<div class="med-card" data-cat="${cats}" onclick="openProduct('${p.id}')">
    <div class="med-icon"><i class="fas ${p.icon || 'fa-pills'}"></i></div>
    <div class="med-info">
      <strong>${p.name}</strong>
      <span class="med-lab">${p.lab || ''}${rx}</span>
      <div class="med-meta">
        <span class="price">R$ ${price}</span>
      </div>
    </div>
    <button class="add-btn" onclick="event.stopPropagation(); addToCart('${(p.shortName || p.name).replace(/'/g, "\\'")}', ${Number(p.price)})"><i class="fas fa-plus"></i></button>
  </div>`;
}

function renderCustomerCatalog() {
  ensurePharmacyCatalog();
  const list = getPharmacyProducts().filter(p => p.active !== false);
  const home = document.getElementById('home-med-list');
  const search = document.getElementById('search-results');
  const html = list.map(medCardHtml).join('');
  if (home) home.innerHTML = html || '<p style="padding:16px;color:var(--gray)">Nenhum produto publicado pela farmácia.</p>';
  if (search) search.innerHTML = html || '<p style="padding:16px;color:var(--gray)">Nenhum produto encontrado.</p>';
}



// ==================== FARMÁCIAS (escolha + mais perto) ====================
const PHARMACIES = [
  {
    id: 'drogasil_paulista',
    name: 'Drogasil Paulista',
    rating: 4.9,
    address: 'Av. Paulista, 1000',
    lat: -23.561414,
    lng: -46.655881
  },
  {
    id: 'raia_consolacao',
    name: 'Droga Raia Consolação',
    rating: 4.8,
    address: 'Rua da Consolação, 2500',
    lat: -23.5552,
    lng: -46.6621
  },
  {
    id: 'pacheco_centro',
    name: 'Drogaria Pacheco Centro',
    rating: 4.7,
    address: 'Rua Direita, 100',
    lat: -23.5505,
    lng: -46.6333
  },
  {
    id: 'ultra_jardins',
    name: 'Ultrafarma Jardins',
    rating: 4.6,
    address: 'Alameda Santos, 800',
    lat: -23.5681,
    lng: -46.6702
  },
  {
    id: 'nissei_bela',
    name: 'Farmácia Nissei Bela Vista',
    rating: 4.5,
    address: 'Rua Augusta, 1500',
    lat: -23.5578,
    lng: -46.6589
  }
];

let selectedPharmacyId = null;
let pickerPending = null; // { name, price }

function haversineKm(a, b) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180;
  const la2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function getUserRefPoint() {
  // Usa primeiro endereço salvo ou ponto padrão SP
  const addresses = typeof getAddresses === 'function' ? getAddresses() : [];
  if (addresses.length && addresses[0]._lat) {
    return { lat: addresses[0]._lat, lng: addresses[0]._lng };
  }
  return { lat: -23.561, lng: -46.656 }; // perto da Paulista
}

function getPharmaciesSorted() {
  const user = getUserRefPoint();
  return PHARMACIES.map(p => ({
    ...p,
    distanceKm: haversineKm(user, p)
  })).sort((a, b) => a.distanceKm - b.distanceKm);
}

function getNearestPharmacy() {
  return getPharmaciesSorted()[0] || PHARMACIES[0];
}

function priceForPharmacy(basePrice, pharmacy, index) {
  // variação leve de preço por farmácia
  const factor = 1 + (index * 0.03) - 0.02;
  return Math.round(basePrice * factor * 100) / 100;
}

function selectProductPharmacy(id) {
  selectedPharmacyId = id;
  renderProductPharmacies();
  // atualiza preço do botão com preço da farmácia escolhida
  const list = getPharmaciesSorted();
  const idx = list.findIndex(p => p.id === id);
  const p = list[idx];
  if (p && currentProduct) {
    const price = priceForPharmacy(currentProduct.price, p, idx);
    currentProduct._selectedPrice = price;
    currentProduct._selectedPharmacy = p;
    const totalEl = document.getElementById('total-price');
    const priceEl = document.getElementById('prod-price');
    const q = qty || 1;
    if (totalEl) totalEl.textContent = (price * q).toFixed(2).replace('.', ',');
    if (priceEl) priceEl.textContent = 'R$ ' + price.toFixed(2).replace('.', ',');
  }
}

function renderProductPharmacies() {
  const el = document.getElementById('prod-pharmacy-list');
  if (!el || !currentProduct) return;
  const list = getPharmaciesSorted();
  if (!selectedPharmacyId) selectedPharmacyId = list[0]?.id;

  el.innerHTML = list
    .map((p, i) => {
      const price = priceForPharmacy(currentProduct.price, p, i);
      const dist = p.distanceKm < 1
        ? (p.distanceKm * 1000).toFixed(0) + ' m'
        : p.distanceKm.toFixed(1).replace('.', ',') + ' km';
      const nearest = i === 0;
      const selected = p.id === selectedPharmacyId;
      return `<div class="pharmacy-option ${selected ? 'selected' : ''}" onclick="selectProductPharmacy('${p.id}')" style="cursor:pointer">
        <div>
          <strong>${p.name}${nearest ? ' <span class="tag green" style="font-size:10px">Mais perto</span>' : ''}</strong>
          <span>${dist} · ${p.rating} ★ · ${p.address}</span>
        </div>
        <span class="price">R$ ${price.toFixed(2).replace('.', ',')}</span>
      </div>`;
    })
    .join('');
}

function openPharmacyPicker(name, price) {
  pickerPending = { name, price };
  const modal = document.getElementById('pharmacy-picker-modal');
  const title = document.getElementById('picker-product-name');
  const listEl = document.getElementById('picker-pharmacy-list');
  if (title) title.textContent = name;
  const list = getPharmaciesSorted();
  listEl.innerHTML = list
    .map((p, i) => {
      const pr = priceForPharmacy(Number(price), p, i);
      const dist = p.distanceKm < 1
        ? (p.distanceKm * 1000).toFixed(0) + ' m'
        : p.distanceKm.toFixed(1).replace('.', ',') + ' km';
      const nearest = i === 0;
      return `<div class="pharmacy-option ${nearest ? 'selected' : ''}" style="cursor:pointer;margin-bottom:8px" onclick="confirmPharmacyPicker('${p.id}')">
        <div>
          <strong>${p.name}${nearest ? ' <span class="tag green" style="font-size:10px">Recomendada</span>' : ''}</strong>
          <span>${dist} · ${p.rating} ★</span>
        </div>
        <span class="price">R$ ${pr.toFixed(2).replace('.', ',')}</span>
      </div>`;
    })
    .join('');
  if (modal) {
    modal.style.display = 'flex';
    modal.classList.add('active');
  }
}

function closePharmacyPicker() {
  const modal = document.getElementById('pharmacy-picker-modal');
  if (modal) {
    modal.style.display = 'none';
    modal.classList.remove('active');
  }
  pickerPending = null;
}

function confirmPharmacyPicker(pharmacyId) {
  if (!pickerPending) return;
  const list = getPharmaciesSorted();
  const idx = list.findIndex(p => p.id === pharmacyId);
  const p = list[idx];
  if (!p) return;
  const price = priceForPharmacy(Number(pickerPending.price), p, Math.max(0, idx));
  addToCart(pickerPending.name, price, p.id, p.name);
  closePharmacyPicker();
}

function openProduct(id) {
  ensurePharmacyCatalog();
  const p = PRODUCTS[id] || Object.values(PRODUCTS)[0];
  if (!p) return;
  currentProduct = { ...p };
  qty = 1;
  selectedPharmacyId = null;

  document.getElementById('prod-name').textContent = p.name;
  document.getElementById('prod-lab').textContent = p.lab;
  document.getElementById('prod-price').textContent = 'R$ ' + p.price.toFixed(2).replace('.', ',');
  document.getElementById('prod-desc').textContent = p.desc;
  document.getElementById('prod-comp').textContent = p.comp;
  document.getElementById('prod-usage').textContent = p.usage;
  document.getElementById('prod-contra').textContent = p.contra;
  document.getElementById('qty').textContent = '1';
  document.getElementById('total-price').textContent = p.price.toFixed(2).replace('.', ',');

  const iconEl = document.getElementById('prod-icon');
  if (iconEl) {
    iconEl.className = 'product-icon';
    iconEl.innerHTML = '<i class="fas ' + (p.icon || 'fa-pills') + '"></i>';
  }

  const tagsEl = document.getElementById('prod-tags');
  if (tagsEl) {
    tagsEl.innerHTML = p.needsRx
      ? '<span class="tag" style="background:#FEF3C7;color:#D97706">Com receita</span>'
      : '<span class="tag">Sem receita</span>';
  }

  renderProductPharmacies();
  // seleciona a mais perto e ajusta preço
  const nearest = getNearestPharmacy();
  if (nearest) selectProductPharmacy(nearest.id);

  showScreen('product');
}

function changeQty(delta) {
  qty = Math.max(1, qty + delta);
  const qtyEl = document.getElementById('qty');
  const totalEl = document.getElementById('total-price');
  const unit = currentProduct._selectedPrice || currentProduct.price;
  if (qtyEl) qtyEl.textContent = qty;
  if (totalEl) totalEl.textContent = (unit * qty).toFixed(2).replace('.', ',');
}

function addCurrentProduct() {
  const pharm = currentProduct._selectedPharmacy || getNearestPharmacy();
  const unit = currentProduct._selectedPrice || currentProduct.price;
  for (let i = 0; i < qty; i++) {
    addToCart(
      currentProduct.shortName,
      unit,
      pharm?.id,
      pharm?.name
    );
  }
  showScreen('cart');
}

// ==================== DRIVER ====================
// Contas específicas de motorista (demo). Em produção: Supabase role "driver".

const DRIVER_ACCOUNTS = [
  {
    login: ['motorista@farmgo.com', 'mot001', 'carlos@farmgo.com'],
    password: '1234',
    name: 'Carlos Silva',
    vehicle: 'Moto',
    rating: 4.9
  },
  {
    login: ['fernanda@farmgo.com', 'mot002'],
    password: '1234',
    name: 'Fernanda Lima',
    vehicle: 'Bike',
    rating: 4.8
  },
  {
    login: ['pedro@farmgo.com', 'mot003'],
    password: '1234',
    name: 'Pedro Santos',
    vehicle: 'Moto',
    rating: 4.7
  }
];

let currentDriver = null;

function handleDriverLogin(event) {
  event.preventDefault();
  const raw = document.getElementById('driver-email').value.trim().toLowerCase();
  const password = document.getElementById('driver-password').value;
  const errorEl = document.getElementById('driver-login-error');

  errorEl.style.display = 'none';

  if (!raw || !password) {
    errorEl.textContent = 'Informe e-mail/código e senha.';
    errorEl.style.display = 'block';
    return;
  }

  const account = DRIVER_ACCOUNTS.find(
    a => a.login.includes(raw) && a.password === password
  );

  if (!account) {
    errorEl.textContent =
      'Login ou senha incorretos. Use motorista@farmgo.com / 1234';
    errorEl.style.display = 'block';
    return;
  }

  currentDriver = account;
  try {
    sessionStorage.setItem(
      'farmgo_driver',
      JSON.stringify({ name: account.name, login: raw })
    );
  } catch (_) {}

  const nameEl = document.getElementById('driver-name');
  if (nameEl) nameEl.textContent = account.name;

  document.getElementById('driver-login-form').reset();
  showScreen('driver-dashboard');
  refreshDriverFromOrders();
}

function handleDriverLogout() {
  currentDriver = null;
  try {
    sessionStorage.removeItem('farmgo_driver');
  } catch (_) {}
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


let selectedAddressIndex = 0;

function prepareCheckout() {
  const addresses = getAddresses();
  const savedBox = document.getElementById('co-saved-address');
  const form = document.getElementById('co-address-form');
  const listEl = document.getElementById('co-address-list');

  if (addresses.length > 0) {
    if (selectedAddressIndex >= addresses.length) selectedAddressIndex = 0;
    const a = addresses[selectedAddressIndex];
    fillCheckoutAddress(a);
    if (savedBox) {
      savedBox.style.display = 'block';
      const label = document.getElementById('co-saved-label');
      const textEl = document.getElementById('co-saved-text');
      if (label) label.textContent = a.label || 'Endereço';
      if (textEl) {
        textEl.innerHTML =
          (a.street || '') + ', ' + (a.number || '') +
          (a.complement ? ' - ' + a.complement : '') + '<br>' +
          (a.neighborhood || '') + ' · ' + (a.city || '') + '/' + (a.state || '') +
          (a.cep ? '<br>CEP ' + a.cep : '');
      }
    }
    if (form) form.style.display = 'none';
    // lista de escolha se tiver mais de um
    if (listEl) listEl.innerHTML = '';
  } else {
    if (savedBox) savedBox.style.display = 'none';
    if (form) form.style.display = 'block';
    if (listEl) listEl.innerHTML = '<p style="font-size:13px;color:var(--gray);margin-bottom:8px">Nenhum endereço salvo. Preencha abaixo.</p>';
  }

  // atualiza label do carrinho
  const cartLabel = document.getElementById('cart-address-label');
  if (cartLabel && addresses[0]) {
    const a = addresses[selectedAddressIndex] || addresses[0];
    cartLabel.textContent = a.street + ', ' + a.number;
  } else if (cartLabel) {
    cartLabel.textContent = 'Informe o endereço no checkout';
  }
}

function showCheckoutAddressForm(showPicker) {
  const form = document.getElementById('co-address-form');
  const savedBox = document.getElementById('co-saved-address');
  const listEl = document.getElementById('co-address-list');
  const addresses = getAddresses();

  if (form) form.style.display = 'block';
  if (savedBox) savedBox.style.display = 'none';

  if (showPicker && listEl && addresses.length) {
    listEl.innerHTML =
      '<p style="font-size:13px;margin-bottom:8px">Escolha um endereço ou preencha outro:</p>' +
      addresses
        .map(
          (a, i) =>
            `<button type="button" class="btn btn-sm ${i === selectedAddressIndex ? 'btn-primary' : 'btn-outline'}" style="margin:0 6px 6px 0" onclick="selectCheckoutAddress(${i})">${a.label || 'Endereço ' + (i + 1)}</button>`
        )
        .join('') +
      '<button type="button" class="btn btn-sm btn-outline" style="margin:0 6px 6px 0" onclick="clearCheckoutAddressForm()">Novo endereço</button>';
  }
}

function selectCheckoutAddress(index) {
  selectedAddressIndex = index;
  const addresses = getAddresses();
  if (addresses[index]) fillCheckoutAddress(addresses[index]);
  prepareCheckout();
}

function clearCheckoutAddressForm() {
  ['co-cep', 'co-street', 'co-number', 'co-complement', 'co-neighborhood'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  const city = document.getElementById('co-city');
  const state = document.getElementById('co-state');
  if (city) city.value = 'São Paulo';
  if (state) state.value = 'SP';
}

function fillCheckoutAddress(a) {
  if (!a) return;
  const set = (id, v) => {
    const el = document.getElementById(id);
    if (el) el.value = v || '';
  };
  set('co-cep', a.cep);
  set('co-street', a.street);
  set('co-number', a.number);
  set('co-complement', a.complement);
  set('co-neighborhood', a.neighborhood);
  set('co-city', a.city || 'São Paulo');
  set('co-state', a.state || 'SP');
}

function getCheckoutAddress() {
  const addresses = getAddresses();
  const form = document.getElementById('co-address-form');
  const formVisible = form && form.style.display !== 'none';

  // Se tem endereço salvo e formulário escondido, usa o selecionado
  if (!formVisible && addresses.length > 0) {
    return addresses[selectedAddressIndex] || addresses[0];
  }

  const street = document.getElementById('co-street')?.value.trim() || '';
  const number = document.getElementById('co-number')?.value.trim() || '';
  if (street && number) {
    return {
      label: 'Entrega',
      cep: document.getElementById('co-cep')?.value.trim() || '',
      street,
      number,
      complement: document.getElementById('co-complement')?.value.trim() || '',
      neighborhood: document.getElementById('co-neighborhood')?.value.trim() || '',
      city: document.getElementById('co-city')?.value.trim() || 'São Paulo',
      state: document.getElementById('co-state')?.value.trim() || 'SP'
    };
  }

  if (addresses.length > 0) return addresses[selectedAddressIndex] || addresses[0];
  return null;
}

function saveAddressFromCheckout() {
  const street = document.getElementById('co-street')?.value.trim();
  const number = document.getElementById('co-number')?.value.trim();
  if (!street || !number) {
    alert('Preencha rua e número para salvar.');
    return;
  }
  const addr = {
    label: 'Casa',
    cep: document.getElementById('co-cep')?.value.trim() || '',
    street,
    number,
    complement: document.getElementById('co-complement')?.value.trim() || '',
    neighborhood: document.getElementById('co-neighborhood')?.value.trim() || '',
    city: document.getElementById('co-city')?.value.trim() || 'São Paulo',
    state: document.getElementById('co-state')?.value.trim() || 'SP'
  };
  const list = getAddresses();
  list.push(addr);
  saveAddresses(list);
  selectedAddressIndex = list.length - 1;
  alert('Endereço salvo!');
  prepareCheckout();
}

function placeOrder() {

  if (cart.length === 0) {
    alert('Carrinho vazio!');
    return;
  }

  const address = getCheckoutAddress();
  if (!address || !address.street || !address.number) {
    alert('Cadastre ou informe um endereço de entrega.');
    showCheckoutAddressForm(true);
    return;
  }

  const profile = getLocalProfile() || {};
  const subtotal = cart.reduce((s, i) => s + i.price * i.qty, 0);
  const freight = getFreight();
  const discount = getDiscount(subtotal);
  const total = Math.max(0, subtotal + freight - discount);
  const pay = document.querySelector('input[name="payment"]:checked');
  const payment = pay ? pay.value : 'pix';

  const id = String(Math.floor(10000 + Math.random() * 90000));
  const now = new Date();
  const mainPharmacy = cart.find(i => i.pharmacyName)?.pharmacyName || cart[0]?.pharmacyName || null;
  const mainPharmacyId = cart.find(i => i.pharmacyId)?.pharmacyId || cart[0]?.pharmacyId || null;

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
    pharmacyName: mainPharmacy,
    pharmacyId: mainPharmacyId,
    customerName: profile.name || 'Cliente',
    customerPhone: profile.phone || '',
    customerEmail: profile.email || '',
    status: 'pending', // pending → confirmed → preparing → out → delivered
    driver: null,
    createdAt: now.toISOString(),
    timeline: [
      { key: 'confirmed', label: 'Pedido confirmado', at: null },
      { key: 'preparing', label: 'Farmácia separando', at: null },
      { key: 'out', label: 'Saiu para entrega', at: null },
      { key: 'delivered', label: 'Entregue', at: null }
    ]
  };

  // baixa estoque
  const plist = getPharmacyProducts();
  order.items.forEach(item => {
    const prod = plist.find(p => p.shortName === item.name || p.name === item.name);
    if (prod) {
      prod.stock = Math.max(0, (parseInt(prod.stock, 10) || 0) - item.qty);
    }
  });
  savePharmacyProducts(plist);

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

  notifyOrderStatus(id, 'pending');
  notifyNewOrderToPharmacy(id);
  openTracking(id);
}

function advanceOrderStatus(orderId, status) {
  const orders = getOrders();
  const order = orders.find(o => o.id === orderId);
  if (!order || order.status === 'delivered') return;

  order.status = status;
  const now = new Date().toISOString();

  // timeline do cliente (sem "pending")
  const order_keys = ['confirmed', 'preparing', 'out', 'delivered'];
  const idx = order_keys.indexOf(status);
  if (idx >= 0) {
    order_keys.slice(0, idx + 1).forEach(k => {
      const step = order.timeline.find(t => t.key === k);
      if (step && !step.at) step.at = now;
    });
  }

  if (status === 'out' && !order.driver) {
    order.driver = {
      name: (typeof currentDriver !== 'undefined' && currentDriver?.name) || 'Motorista',
      phone: '',
      rating: (typeof currentDriver !== 'undefined' && currentDriver?.rating) || 4.9
    };
  }

  saveOrders(orders);

  // Notificação em tempo real (cliente + sistema)
  notifyOrderStatus(orderId, status);

  // Aviso extra para motorista quando pedido fica pronto
  if (status === 'preparing') {
    const dash = document.getElementById('driver-dashboard');
    if (dash && dash.classList.contains('active')) {
      showToast('Pedido pronto', '#' + orderId + ' separado — saia para entrega.');
    }
  }

  // Atualiza painel do cliente se estiver aberto
  if (currentTrackId === orderId) renderTracking(orderId);
  const ordersScreen = document.getElementById('orders');
  if (ordersScreen && ordersScreen.classList.contains('active')) {
    renderOrdersList(ordersListMode || 'active');
  }

  refreshPharmacyFromOrders();
  if (typeof refreshDriverFromOrders === 'function') refreshDriverFromOrders();
}

// ==================== MAPA (OpenStreetMap + OSRM) ====================
let trackMap = null;
let trackMarkers = { pharmacy: null, driver: null, customer: null };
let trackRouteLine = null;
let trackTraveledLine = null;
let driverAnimTimer = null;
let lastRouteCoords = null;
let lastRouteMeta = null;

const DEFAULT_PHARMACY = { lat: -23.561414, lng: -46.655881, label: 'Farmácia · Av. Paulista' };
const DEFAULT_CUSTOMER = { lat: -23.5575, lng: -46.6625 };
const OSRM_BASE = 'https://router.project-osrm.org';

function formatDistance(meters) {
  if (meters >= 1000) return (meters / 1000).toFixed(1).replace('.', ',') + ' km';
  return Math.round(meters) + ' m';
}

function formatDuration(seconds) {
  const m = Math.max(1, Math.round(seconds / 60));
  if (m < 60) return m + ' min';
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return h + ' h ' + rm + ' min';
}

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

  trackMap = L.map(el, { zoomControl: true }).setView(
    [DEFAULT_PHARMACY.lat, DEFAULT_PHARMACY.lng],
    14
  );
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap'
  }).addTo(trackMap);
  setTimeout(() => trackMap.invalidateSize(), 200);
  return trackMap;
}

function clearDriverAnimation() {
  if (driverAnimTimer) {
    clearInterval(driverAnimTimer);
    driverAnimTimer = null;
  }
}

function clearMapLayers() {
  clearDriverAnimation();
  if (!trackMap) return;
  ['pharmacy', 'driver', 'customer'].forEach(k => {
    if (trackMarkers[k]) {
      trackMap.removeLayer(trackMarkers[k]);
      trackMarkers[k] = null;
    }
  });
  if (trackRouteLine) {
    trackMap.removeLayer(trackRouteLine);
    trackRouteLine = null;
  }
  if (trackTraveledLine) {
    trackMap.removeLayer(trackTraveledLine);
    trackTraveledLine = null;
  }
}

async function geocodeAddress(address) {
  if (!address) return null;
  const q = [
    address.street,
    address.number,
    address.neighborhood,
    address.city || 'São Paulo',
    address.state || 'SP',
    'Brasil'
  ]
    .filter(Boolean)
    .join(', ');
  const cacheKey = 'farmgo_geo_osm_' + q;
  try {
    const cached = sessionStorage.getItem(cacheKey);
    if (cached) return JSON.parse(cached);
  } catch (_) {}

  try {
    const url =
      'https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=br&q=' +
      encodeURIComponent(q);
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    const data = await res.json();
    if (data && data[0]) {
      const point = {
        lat: parseFloat(data[0].lat),
        lng: parseFloat(data[0].lon),
        label: data[0].display_name || q
      };
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

async function fetchDrivingRoute(from, to) {
  const cacheKey =
    'farmgo_osrm_' +
    from.lat.toFixed(4) +
    ',' +
    from.lng.toFixed(4) +
    '_' +
    to.lat.toFixed(4) +
    ',' +
    to.lng.toFixed(4);
  try {
    const c = sessionStorage.getItem(cacheKey);
    if (c) return JSON.parse(c);
  } catch (_) {}

  try {
    const url =
      OSRM_BASE +
      '/route/v1/driving/' +
      from.lng +
      ',' +
      from.lat +
      ';' +
      to.lng +
      ',' +
      to.lat +
      '?overview=full&geometries=geojson&steps=true&alternatives=true';
    const res = await fetch(url);
    const data = await res.json();
    if (data.code !== 'Ok' || !data.routes?.[0]) return null;
    const best = data.routes.slice().sort((a, b) => a.duration - b.duration)[0];
    const coords = best.geometry.coordinates.map(c => [c[1], c[0]]);
    const steps = [];
    (best.legs || []).forEach(leg => {
      (leg.steps || []).forEach(s => {
        if (s.name) steps.push({ name: s.name, distance: s.distance, duration: s.duration });
      });
    });
    const result = {
      coords,
      distance: best.distance,
      duration: best.duration,
      steps,
      alternatives: data.routes.length - 1
    };
    try {
      sessionStorage.setItem(cacheKey, JSON.stringify(result));
    } catch (_) {}
    return result;
  } catch (e) {
    console.warn('OSRM:', e);
    return null;
  }
}

async function optimizeDeliveryTrip(start, points) {
  if (!points?.length) return null;
  if (points.length === 1) {
    const route = await fetchDrivingRoute(start, points[0]);
    return {
      order: points,
      coords: route?.coords || [
        [start.lat, start.lng],
        [points[0].lat, points[0].lng]
      ],
      distance: route?.distance || 0,
      duration: route?.duration || 0
    };
  }

  try {
    const coordsStr = [start, ...points].map(p => p.lng + ',' + p.lat).join(';');
    const url =
      OSRM_BASE +
      '/trip/v1/driving/' +
      coordsStr +
      '?source=first&destination=any&roundtrip=false&geometries=geojson&overview=full';
    const res = await fetch(url);
    const data = await res.json();
    if (data.code === 'Ok' && data.trips?.[0]) {
      const trip = data.trips[0];
      const wp = data.waypoints || [];
      const ordered = wp
        .map((w, i) => ({ i, order: w.waypoint_index }))
        .sort((a, b) => a.order - b.order)
        .map(x => x.i)
        .filter(i => i > 0)
        .map(i => points[i - 1]);
      return {
        order: ordered.length ? ordered : points,
        coords: trip.geometry.coordinates.map(c => [c[1], c[0]]),
        distance: trip.distance,
        duration: trip.duration
      };
    }
  } catch (e) {
    console.warn('OSRM trip:', e);
  }
  return null;
}

function animateDriverAlongRoute(coords, durationMs) {
  clearDriverAnimation();
  if (!trackMarkers.driver || !coords || coords.length < 2) return;

  const seg = [];
  let total = 0;
  for (let i = 1; i < coords.length; i++) {
    const d = trackMap.distance(coords[i - 1], coords[i]);
    total += d;
    seg.push(total);
  }
  if (total <= 0) return;

  const start = Date.now();
  driverAnimTimer = setInterval(() => {
    const t = Math.min(1, (Date.now() - start) / durationMs);
    const targetDist = total * t;
    let i = 0;
    while (i < seg.length && seg[i] < targetDist) i++;
    const prevDist = i === 0 ? 0 : seg[i - 1];
    const nextDist = seg[i] || total;
    const a = coords[i] || coords[coords.length - 1];
    const b = coords[i + 1] || a;
    const localT = nextDist === prevDist ? 1 : (targetDist - prevDist) / (nextDist - prevDist);
    const lat = a[0] + (b[0] - a[0]) * localT;
    const lng = a[1] + (b[1] - a[1]) * localT;
    trackMarkers.driver.setLatLng([lat, lng]);
    if (trackTraveledLine) {
      const traveled = coords.slice(0, i + 1);
      traveled.push([lat, lng]);
      trackTraveledLine.setLatLngs(traveled);
    }
    if (t >= 1) clearDriverAnimation();
  }, 250);
}

async function updateTrackingMap(order) {
  const hint = document.getElementById('track-map-hint');
  const map = ensureTrackMap();
  if (!map) {
    if (hint) hint.textContent = 'Mapa indisponível. Verifique a internet.';
    return;
  }

  if (hint) hint.textContent = 'Calculando rota pelas ruas…';

  const pharmacy = {
    lat: DEFAULT_PHARMACY.lat,
    lng: DEFAULT_PHARMACY.lng,
    label: DEFAULT_PHARMACY.label
  };

  let customer = await geocodeAddress(order.address);
  if (!customer) {
    customer = {
      lat: DEFAULT_CUSTOMER.lat,
      lng: DEFAULT_CUSTOMER.lng,
      label: order.address
        ? `${order.address.street}, ${order.address.number}`
        : 'Endereço aproximado'
    };
  }

  clearMapLayers();

  trackMarkers.pharmacy = L.marker([pharmacy.lat, pharmacy.lng], {
    icon: createMapIcon('💊', '#F97316')
  })
    .addTo(map)
    .bindPopup('<strong>Farmácia</strong><br>' + pharmacy.label);

  const custLabel = order.address
    ? `${order.address.street}, ${order.address.number}` +
      (order.address.neighborhood ? '<br>' + order.address.neighborhood : '')
    : customer.label || 'Entrega';

  trackMarkers.customer = L.marker([customer.lat, customer.lng], {
    icon: createMapIcon('🏠', '#2563EB')
  })
    .addTo(map)
    .bindPopup('<strong>Entrega</strong><br>' + custLabel);

  const route = await fetchDrivingRoute(pharmacy, customer);
  let coords;
  let distance = 0;
  let duration = 0;

  if (route?.coords?.length > 1) {
    coords = route.coords;
    distance = route.distance;
    duration = route.duration;
    lastRouteCoords = coords;
    lastRouteMeta = {
      distance,
      duration,
      steps: route.steps || [],
      alternatives: route.alternatives || 0
    };
  } else {
    coords = [
      [pharmacy.lat, pharmacy.lng],
      [customer.lat, customer.lng]
    ];
    distance = map.distance(coords[0], coords[1]);
    duration = (distance / 1000 / 25) * 3600;
    lastRouteMeta = { distance, duration, steps: [], alternatives: 0 };
  }

  trackRouteLine = L.polyline(coords, {
    color: '#F97316',
    weight: 5,
    opacity: 0.9,
    lineJoin: 'round'
  }).addTo(map);

  trackTraveledLine = L.polyline([], {
    color: '#10B981',
    weight: 5,
    opacity: 0.95
  }).addTo(map);

  if (order.status === 'out' || order.status === 'delivered') {
    const startIdx =
      order.status === 'delivered' ? coords.length - 1 : Math.floor(coords.length * 0.2);
    const driverPos = coords[startIdx];
    trackMarkers.driver = L.marker(driverPos, {
      icon: createMapIcon('🏍️', '#10B981')
    })
      .addTo(map)
      .bindPopup(
        '<strong>' +
          (order.driver?.name || 'Entregador') +
          '</strong><br>' +
          formatDistance(distance) +
          ' · ~' +
          formatDuration(duration)
      );

    if (order.status === 'out') {
      const remaining = coords.slice(startIdx);
      const animMs = Math.min(180000, Math.max(30000, duration * 500));
      animateDriverAlongRoute(remaining, animMs);
    }
  }

  map.fitBounds(L.latLngBounds(coords).pad(0.2));
  setTimeout(() => map.invalidateSize(), 200);

  const eta = formatDistance(distance) + ' · ~' + formatDuration(duration);
  const stepsEl = document.getElementById('track-route-steps');
  if (stepsEl && lastRouteMeta?.steps?.length) {
    const top = lastRouteMeta.steps
      .map(s => s.name)
      .filter(Boolean)
      .filter((v, i, a) => a.indexOf(v) === i)
      .slice(0, 4);
    stepsEl.innerHTML = top.length ? '<strong>Rota:</strong> ' + top.join(' → ') : '';
  }

  if (hint) {
    const alt = lastRouteMeta?.alternatives
      ? ' · melhor de ' + (lastRouteMeta.alternatives + 1) + ' rotas'
      : '';
    if (order.status === 'out') hint.textContent = 'Rota otimizada · ' + eta + alt;
    else if (order.status === 'delivered') hint.textContent = 'Entregue · ' + formatDistance(distance);
    else hint.textContent = 'OpenStreetMap · ' + eta + alt;
  }
  const sub = document.getElementById('track-status-sub');
  if (sub) {
    if (order.status === 'delivered') sub.textContent = 'Pedido entregue no endereço';
    else sub.textContent = 'Distância ' + formatDistance(distance) + ' · ~' + formatDuration(duration);
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
    pending: 'Aguardando farmácia',
    confirmed: 'Pedido confirmado',
    preparing: 'Farmácia separando',
    out: 'Saiu para entrega',
    delivered: 'Entregue'
  };
  if (st) st.textContent = labels[order.status] || order.status;
  if (sub) {
    if (order.status === 'delivered') sub.textContent = 'Pedido entregue com sucesso';
    else if (order.status === 'out') sub.textContent = 'Motorista a caminho';
    else if (order.status === 'preparing') sub.textContent = 'A farmácia está separando seus itens';
    else if (order.status === 'confirmed') sub.textContent = 'Farmácia confirmou · logo começa a separar';
    else if (order.status === 'pending') sub.textContent = 'Aguardando a farmácia confirmar o pedido';
    else sub.textContent = 'Acompanhe o status abaixo';
  }

  if (steps) {
    const order_keys = ['confirmed', 'preparing', 'out', 'delivered'];
    // pending = nenhum passo ativo ainda
    let cur = order_keys.indexOf(order.status);
    if (order.status === 'pending') cur = -1;
    steps.innerHTML = order.timeline.map((t, i) => {
      let cls = 't-step';
      if (i < cur) cls += ' done';
      if (i === cur) cls += ' active done';
      const time = t.at
        ? new Date(t.at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
        : '—';
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
    pending: 'Aguardando',
    confirmed: 'Confirmado',
    preparing: 'Separando',
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
  const container = document.getElementById('pharm-orders-live') || document.getElementById('pharm-tab-pedidos');
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
    if (container.id === 'pharm-orders-live') {
      container.innerHTML = '<p style="color:var(--gray);font-size:14px">Nenhum pedido em andamento.</p>';
    }
    return;
  }

  const statusLabel = {
    pending: 'Novo',
    confirmed: 'Confirmado',
    preparing: 'Separado',
    out: 'Em rota',
    delivered: 'Entregue'
  };
  let html = '';
  html += orders.slice(0, 12).map(o => {
    const items = o.items.map(i => i.name + ' ×' + i.qty).join(' · ');
    let actionBtn = '';
    if (o.status === 'pending') {
      actionBtn = `<button class="btn btn-sm btn-primary" onclick="pharmacyConfirmOrder('${o.id}')"><i class="fas fa-check"></i> Confirmar pedido</button>`;
    } else if (o.status === 'confirmed') {
      actionBtn = `<button class="btn btn-sm btn-primary" onclick="pharmacySeparateOrder('${o.id}')"><i class="fas fa-box-open"></i> Separar</button>`;
    } else if (o.status === 'preparing') {
      actionBtn = `<span class="order-status done">Aguardando motorista</span>`;
    } else if (o.status === 'out') {
      actionBtn = `<button class="btn btn-sm btn-outline" onclick="openTracking('${o.id}')">Em rota</button>`;
    } else {
      actionBtn = `<button class="btn btn-sm btn-outline" onclick="openTracking('${o.id}')">Ver</button>`;
    }
    return `<div class="order-card">
      <div class="order-header">
        <span class="order-id">#${o.id}</span>
        <span class="order-status active">${statusLabel[o.status] || o.status}</span>
      </div>
      <div class="order-items">${items}</div>
      <div class="order-footer" style="gap:8px;flex-wrap:wrap">
        <span>${o.customerName || 'Cliente'}</span>
        ${actionBtn}
      </div>
    </div>`;
  }).join('');
  container.innerHTML = html;
}

/** Farmácia: confirma o pedido (cliente vê "Pedido confirmado") */
function pharmacyConfirmOrder(id) {
  advanceOrderStatus(id, 'confirmed');
  refreshPharmacyFromOrders();
}

/** Farmácia: separa os itens (cliente vê "Farmácia separando") */
function pharmacySeparateOrder(id) {
  advanceOrderStatus(id, 'preparing');
  refreshPharmacyFromOrders();
}

async function refreshDriverFromOrders() {
  const activeEl = document.getElementById('driver-active-delivery');
  const queueEl = document.getElementById('driver-queue-list');
  const optEl = document.getElementById('driver-route-opt');

  const out = getOrders().filter(o => o.status === 'out');
  const queue = getOrders().filter(o => o.status === 'preparing');
  const deliveredToday = getOrders().filter(o => {
    if (o.status !== 'delivered') return false;
    const d = new Date(o.createdAt);
    const n = new Date();
    return d.toDateString() === n.toDateString();
  });

  const setStat = (id, v) => {
    const el = document.getElementById(id);
    if (el) el.textContent = String(v);
  };
  setStat('driver-stat-active', out.length);
  setStat('driver-stat-done', deliveredToday.length);
  setStat(
    'driver-stat-today',
    getOrders().filter(o => new Date(o.createdAt).toDateString() === new Date().toDateString()).length
  );

  // —— Entrega ativa (em rota) ——
  if (activeEl) {
    if (out.length === 0) {
      activeEl.innerHTML =
        '<div class="order-card" style="opacity:.85"><div class="order-items">Nenhuma entrega em andamento.<br><span style="color:var(--gray);font-size:13px">Toque em “Saiu para entrega” na fila abaixo.</span></div></div>';
    } else {
      activeEl.innerHTML = out
        .map(o => {
          const items = o.items.map(i => i.name + (i.qty > 1 ? ' ×' + i.qty : '')).join(' · ');
          const addr = o.address
            ? `${o.address.street}, ${o.address.number}` +
              (o.address.complement ? ' — ' + o.address.complement : '')
            : 'Endereço';
          const pharm = o.pharmacyName || o.items?.[0]?.pharmacyName || 'Farmácia';
          return `<div class="order-card" style="border-color:var(--primary);border-width:1.5px">
            <div class="order-header">
              <span class="order-id">#${o.id}</span>
              <span class="order-status active">Em rota</span>
            </div>
            <div class="order-items">${items}</div>
            <div style="font-size:13px;color:var(--gray);margin:8px 0">
              <div><i class="fas fa-store" style="width:18px;color:var(--primary)"></i> ${pharm}</div>
              <div style="margin-top:4px"><i class="fas fa-map-marker-alt" style="width:18px;color:var(--primary)"></i> ${addr}</div>
              <div style="margin-top:4px"><i class="fas fa-user" style="width:18px"></i> ${o.customerName || 'Cliente'}${o.customerPhone ? ' · ' + o.customerPhone : ''}</div>
            </div>
            <div class="order-footer" style="gap:8px;flex-wrap:wrap">
              <button class="btn btn-sm btn-outline" onclick="alert('Ligando para o cliente...')"><i class="fas fa-phone"></i> Ligar</button>
              <button class="btn btn-sm btn-outline" onclick="openTracking('${o.id}')"><i class="fas fa-map"></i> Mapa</button>
              <button class="btn btn-sm btn-primary" onclick="driverConfirmDelivered('${o.id}')"><i class="fas fa-check"></i> Confirmar entrega</button>
            </div>
          </div>`;
        })
        .join('');
    }
  }

  // —— Fila (prontos para sair) ——
  if (queueEl) {
    if (queue.length === 0) {
      queueEl.innerHTML =
        '<p style="color:var(--gray);font-size:14px">Nenhum pedido na fila. Quando a farmácia separar, aparece aqui.</p>';
    } else {
      // ordena por distância aproximada do ponto do motorista/farmácia
      const ref = DEFAULT_PHARMACY;
      const enriched = await Promise.all(
        queue.map(async o => {
          let distKm = 999;
          try {
            const geo = await geocodeAddress(o.address);
            if (geo) distKm = haversineKm(ref, geo);
          } catch (_) {}
          return { order: o, distKm };
        })
      );
      enriched.sort((a, b) => a.distKm - b.distKm);

      queueEl.innerHTML = enriched
        .map(({ order: o, distKm }, i) => {
          const items = o.items.map(it => it.name).join(' · ');
          const addr = o.address ? `${o.address.street}, ${o.address.number}` : 'Endereço';
          const distLabel =
            distKm >= 999
              ? '—'
              : distKm < 1
                ? Math.round(distKm * 1000) + ' m'
                : distKm.toFixed(1).replace('.', ',') + ' km';
          const nextBadge = i === 0 && out.length === 0
            ? ' <span class="tag green" style="font-size:10px">Próxima</span>'
            : '';
          return `<div class="order-card">
            <div class="order-header">
              <span class="order-id">#${o.id}${nextBadge}</span>
              <span class="order-status done">Pronto p/ entrega</span>
            </div>
            <div class="order-items">${items}</div>
            <div style="font-size:13px;color:var(--gray);margin:8px 0">
              <div><i class="fas fa-map-marker-alt" style="width:18px"></i> ${addr}</div>
              <div style="margin-top:4px"><i class="fas fa-user" style="width:18px"></i> ${o.customerName || 'Cliente'}</div>
            </div>
            <div class="order-footer" style="gap:8px;flex-wrap:wrap">
              <span>~${distLabel}</span>
              <button class="btn btn-sm btn-primary" onclick="driverStartDelivery('${o.id}')">
                <i class="fas fa-motorcycle"></i> Saiu para entrega
              </button>
            </div>
          </div>`;
        })
        .join('');
    }
  }

  if (optEl) {
    const pending = [...out, ...queue].slice(0, 5);
    if (pending.length >= 2) {
      optEl.style.display = 'block';
      optEl.innerHTML =
        '<button class="btn btn-outline btn-block" onclick="optimizeDriverStops()"><i class="fas fa-magic"></i> Otimizar ordem das entregas</button>' +
        '<p id="driver-opt-result" style="font-size:12px;color:var(--gray);margin-top:8px"></p>';
    } else {
      optEl.style.display = 'none';
    }
  }
}

/** Motorista: sai da farmácia / inicia rota */
function driverStartDelivery(orderId) {
  advanceOrderStatus(orderId, 'out');
  // garante motorista no pedido
  const orders = getOrders();
  const o = orders.find(x => x.id === orderId);
  if (o) {
    o.driver = o.driver || {
      name: (currentDriver && currentDriver.name) ||
        document.getElementById('driver-name')?.textContent ||
        'Motorista',
      phone: '',
      rating: (currentDriver && currentDriver.rating) || 4.9,
      vehicle: (currentDriver && currentDriver.vehicle) || 'Moto'
    };
    saveOrders(orders);
  }
  refreshDriverFromOrders();
  // opcional: abrir rastreio
  // openTracking(orderId);
}

/** Motorista: confirma entrega e calcula a próxima */
async function driverConfirmDelivered(orderId) {
  advanceOrderStatus(orderId, 'delivered');

  // Calcula próxima mais próxima
  const queue = getOrders().filter(o => o.status === 'preparing');
  let nextId = null;
  let nextDist = Infinity;

  if (queue.length) {
    const ref = DEFAULT_PHARMACY;
    for (const o of queue) {
      try {
        const geo = await geocodeAddress(o.address);
        if (geo) {
          const d = haversineKm(ref, geo);
          if (d < nextDist) {
            nextDist = d;
            nextId = o.id;
          }
        } else if (!nextId) {
          nextId = o.id;
        }
      } catch (_) {
        if (!nextId) nextId = o.id;
      }
    }
  }

  await refreshDriverFromOrders();

  if (nextId) {
    const distLabel =
      nextDist < Infinity
        ? nextDist < 1
          ? Math.round(nextDist * 1000) + ' m'
          : nextDist.toFixed(1).replace('.', ',') + ' km'
        : '';
    const go = confirm(
      'Entrega #' +
        orderId +
        ' confirmada!\n\nPróxima mais perto: #' +
        nextId +
        (distLabel ? ' (~' + distLabel + ')' : '') +
        '\n\nSair para essa entrega agora?'
    );
    if (go) driverStartDelivery(nextId);
  } else {
    alert('Entrega #' + orderId + ' confirmada!\nNão há mais pedidos na fila.');
  }
}

function driverMarkDelivered(orderId) {
  driverConfirmDelivered(orderId);
}

async function optimizeDriverStops() {
  const resultEl = document.getElementById('driver-opt-result');
  if (resultEl) resultEl.textContent = 'Calculando melhor sequência…';

  const pending = getOrders().filter(
    o => o.status === 'out' || o.status === 'preparing' || o.status === 'confirmed'
  );
  if (pending.length < 2) {
    if (resultEl) resultEl.textContent = 'Precisa de pelo menos 2 entregas.';
    return;
  }

  const points = [];
  for (const o of pending.slice(0, 6)) {
    let geo = await geocodeAddress(o.address);
    if (!geo) {
      geo = {
        lat: DEFAULT_CUSTOMER.lat + (Math.random() - 0.5) * 0.02,
        lng: DEFAULT_CUSTOMER.lng + (Math.random() - 0.5) * 0.02
      };
    }
    points.push({
      lat: geo.lat,
      lng: geo.lng,
      id: o.id,
      label: '#' + o.id + ' · ' + (o.address?.street || 'Cliente')
    });
  }

  const trip = await optimizeDeliveryTrip(DEFAULT_PHARMACY, points);
  if (!trip) {
    if (resultEl) resultEl.textContent = 'Não foi possível otimizar agora.';
    return;
  }

  if (resultEl) {
    resultEl.innerHTML =
      '<strong>Ordem otimizada</strong> · ' +
      formatDistance(trip.distance) +
      ' · ~' +
      formatDuration(trip.duration) +
      '<br>' +
      trip.order.map((p, i) => i + 1 + '. ' + p.label).join('<br>');
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
  loadCart();
  updateCartUI();
  updateCartBadges();
  checkSession();
  updateFirstPurchaseUI();
  updateBiometricButton();
  updateProfileUI();
  updateNotifBadge();
  registerServiceWorker();
  try {
    ensurePharmacyCatalog();
    renderCustomerCatalog();
  } catch (e) {
    console.warn(e);
  }

  document.querySelectorAll('.payment-option').forEach(opt => {
    opt.addEventListener('click', () => {
      document.querySelectorAll('.payment-option').forEach(o => o.classList.remove('selected'));
      opt.classList.add('selected');
      const input = opt.querySelector('input');
      if (input) input.checked = true;
    });
  });

  // Clique em notificação do service worker
  if (navigator.serviceWorker) {
    navigator.serviceWorker.addEventListener('message', (event) => {
      if (event.data && event.data.type === 'NOTIFICATION_CLICK') {
        const orderId = event.data.data && event.data.data.orderId;
        if (orderId) openTracking(orderId);
        else showScreen('notifications');
      }
    });
  }

  // Sincroniza entre abas via localStorage
  window.addEventListener('storage', (e) => {
    if (e.key === 'farmgo_orders') {
      if (currentTrackId) renderTracking(currentTrackId);
      if (document.getElementById('orders')?.classList.contains('active')) {
        renderOrdersList(ordersListMode || 'active');
      }
      refreshPharmacyFromOrders();
      if (typeof refreshDriverFromOrders === 'function') refreshDriverFromOrders();
    }
    if (e.key === NOTIF_KEY) updateNotifBadge();
  });
});
