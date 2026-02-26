// ========================================
// FIREBASE INIT (compat mode, no imports)
// ========================================
const firebaseConfig = {
	apiKey: 'AIzaSyC-bSkpW3DiIo5aTx0bfI7nqnvU2EIl2c4',
	authDomain: 'dima-chat-ae605.firebaseapp.com',
	databaseURL:
		'https://dima-chat-ae605-default-rtdb.europe-west1.firebasedatabase.app',
	projectId: 'dima-chat-ae605',
	storageBucket: 'dima-chat-ae605.firebasestorage.app',
	messagingSenderId: '353476225291',
	appId: '1:353476225291:web:b34851858e6565be22da0e',
}

window.ADMIN_EMAIL = 'klosa148@gmail.com'

let firebaseEnabled = false
let auth, database, provider

try {
	firebase.initializeApp(firebaseConfig)
	auth = firebase.auth()
	database = firebase.database()
	provider = new firebase.auth.GoogleAuthProvider()
	firebaseEnabled = true
	console.log('✅ Firebase инициализирован!')
} catch (error) {
	console.error('❌ Ошибка Firebase:', error)
	setTimeout(() => {
		document.getElementById('authLoading').style.display = 'none'
		document.getElementById('mainContent').style.display = 'block'
	}, 500)
}

window.currentUser = null
window.currentBalanceAction = null
window.database = database

// ========================================
// AUTH
// ========================================
window.skipAuth = function () {
	document.getElementById('authLoading').style.display = 'none'
	document.getElementById('loginScreen').style.display = 'none'
	document.getElementById('mainContent').style.display = 'block'
}

if (firebaseEnabled) {
	document.getElementById('loginBtn').addEventListener('click', async () => {
		try {
			await auth.signInWithPopup(provider)
		} catch (e) {
			alert('Ошибка входа: ' + e.message)
		}
	})

	document
		.getElementById('googleSignIn')
		.addEventListener('click', async () => {
			try {
				await auth.signInWithPopup(provider)
			} catch (e) {
				alert('Ошибка входа: ' + e.message)
			}
		})

	document.getElementById('signOutBtn').addEventListener('click', async () => {
		try {
			await auth.signOut()
			localStorage.removeItem('chatUsername')
		} catch (e) {
			console.error(e)
		}
	})

	const addBalanceBtn = document.getElementById('addBalanceBtn')
	const withdrawBalanceBtn = document.getElementById('withdrawBalanceBtn')

	if (addBalanceBtn) {
		addBalanceBtn.addEventListener('click', () => {
			window.currentBalanceAction = 'add'
			document.getElementById('modalTitle').textContent = 'Пополнить баланс'
			document.getElementById('amountInput').value = ''
			document.getElementById('balanceModal').style.display = 'block'
		})
	}

	if (withdrawBalanceBtn) {
		withdrawBalanceBtn.addEventListener('click', () => {
			window.currentBalanceAction = 'withdraw'
			document.getElementById('modalTitle').textContent = 'Снять средства'
			document.getElementById('amountInput').value = ''
			document.getElementById('balanceModal').style.display = 'block'
		})
	}

	auth.onAuthStateChanged(async user => {
		document.getElementById('authLoading').style.display = 'flex'

		if (user) {
			window.currentUser = user
			checkAdminAccess()
			localStorage.setItem('chatUsername', user.displayName || 'Пользователь')
			await ensureUserExists(user)
			await loadUserData(user)
			await loadUpgradesFromFirebase(user.uid)
			document.getElementById('loginBtn').style.display = 'none'
			document.getElementById('signOutBtn').style.display = 'inline-block'
			document.getElementById('loginScreen').style.display = 'none'
			document.getElementById('mainContent').style.display = 'block'
			loadChatMessages()
		} else {
			window.currentUser = null
			document.getElementById('loginBtn').style.display = 'inline-block'
			document.getElementById('signOutBtn').style.display = 'none'
			document.getElementById('loginScreen').style.display = 'none'
			document.getElementById('mainContent').style.display = 'block'
			document.getElementById('userName').textContent = 'Гость'
			document.getElementById('userAvatar').src = 'img/ico2.png'
			const cud = document.getElementById('currentUserDisplay')
			if (cud) cud.textContent = 'Гость'
			loadChatMessages()
		}

		document.getElementById('authLoading').style.display = 'none'
	})

	async function ensureUserExists(user) {
		try {
			const snap = await database.ref(`users/${user.uid}`).once('value')
			if (!snap.exists()) {
				await database.ref(`users/${user.uid}`).set({
					email: user.email,
					displayName: user.displayName,
					photoURL: user.photoURL,
					balance: 0,
					createdAt: Date.now(),
				})
			}
		} catch (e) {
			console.error(e)
		}
	}

	async function loadUserData(user) {
		try {
			document.getElementById('userName').textContent =
				user.displayName || 'Пользователь'
			document.getElementById('userAvatar').src =
				user.photoURL || 'img/ico2.png'
			const cud = document.getElementById('currentUserDisplay')
			if (cud) cud.textContent = user.displayName || 'Пользователь'

			const snap = await database.ref(`users/${user.uid}`).once('value')
			if (snap.exists()) {
				const data = snap.val()
				userCurrency = data.balance || 0
				updateCurrencyDisplay()
				const bv = document.getElementById('balanceValue')
				if (bv) bv.textContent = userCurrency.toLocaleString('ru-RU')
			}
			await loadTransactions(user.uid)
		} catch (e) {
			console.error(e)
		}
	}

	async function loadTransactions(userId) {
		const list = document.getElementById('transactionsList')
		if (!list) return
		try {
			const snap = await database
				.ref('transactions')
				.orderByChild('userId')
				.limitToLast(50)
				.once('value')

			if (!snap.exists()) {
				list.innerHTML = '<p class="no-transactions">Пока нет операций</p>'
				return
			}

			const txs = []
			snap.forEach(c => {
				if (c.val().userId === userId) txs.push({ id: c.key, ...c.val() })
			})

			if (!txs.length) {
				list.innerHTML = '<p class="no-transactions">Пока нет операций</p>'
				return
			}

			txs.sort((a, b) => b.timestamp - a.timestamp)
			list.innerHTML = ''
			txs
				.slice(0, 10)
				.forEach(tx => list.appendChild(createTransactionElement(tx)))
		} catch (e) {
			console.error(e)
		}
	}

	function createTransactionElement(tx) {
		const div = document.createElement('div')
		div.className = 'transaction-item'
		const pos = tx.amount > 0
		const date = new Intl.DateTimeFormat('ru-RU', {
			day: 'numeric',
			month: 'long',
			hour: '2-digit',
			minute: '2-digit',
		}).format(new Date(tx.timestamp))
		div.innerHTML = `
			<div class="transaction-info">
				<div class="transaction-type">${pos ? 'Пополнение' : 'Снятие'}</div>
				<div class="transaction-date">${date}</div>
			</div>
			<div class="transaction-amount ${pos ? 'positive' : 'negative'}">
				${pos ? '+' : ''}${Math.abs(tx.amount).toLocaleString('ru-RU')} ₽
			</div>`
		return div
	}

	// FIX CHAT: Track if listener is already attached to avoid duplicates
	let chatListenerAttached = false

	// ================================================
	// ИНСТРУКЦИЯ: ЗАМЕНИ ПОЛНОСТЬЮ функцию loadChatMessages
	// в script.js (внутри блока if (firebaseEnabled))
	// ================================================

	function loadChatMessages() {
		const container = document.getElementById('chatMessages')
		if (!container) return

		database.ref('messages').off('child_added')
		container.innerHTML =
			'<div class="loading-message">Загрузка сообщений...</div>'

		let firstLoad = true

		database
			.ref('messages')
			.orderByChild('timestamp')
			.limitToLast(50)
			.on('child_added', snap => {
				if (!container) return

				if (firstLoad) {
					container.innerHTML = ''
					firstLoad = false
				}

				if (container.querySelector(`[data-msg-id="${snap.key}"]`)) return

				const msg = snap.val()
				if (!msg) return

				const div = document.createElement('div')
				div.className = 'message'
				div.dataset.msgId = snap.key

				const time = new Date(msg.timestamp).toLocaleTimeString('ru-RU', {
					hour: '2-digit',
					minute: '2-digit',
				})

				let body = ''
				if (msg.text) body += `<div class="message-text">${msg.text}</div>`
				if (msg.image) {
					body += `<div class="message-image-wrap" style="margin-top:8px;max-width:280px;">
						<img src="${msg.image}"
							class="message-chat-image"
							style="width:100%;border-radius:12px;cursor:pointer;max-height:260px;object-fit:cover;border:1px solid #2f3336"
							onclick="openChatImageFullById(this)"
							loading="lazy"
							alt="фото">
					</div>`
				}

				div.innerHTML = `
					<div class="message-avatar">${(msg.username || '?').charAt(0).toUpperCase()}</div>
					<div class="message-content">
						<div class="message-header">
							<span class="message-username">${msg.username || 'Гость'}</span>
							<span class="message-time">${time}</span>
						</div>
						${body}
					</div>`

				container.appendChild(div)
				container.scrollTop = container.scrollHeight
				checkScrollPosition()
			})
	}

	window.closeBalanceModal = function () {
		document.getElementById('balanceModal').style.display = 'none'
	}

	window.confirmBalanceAction = async function () {
		const amount = parseFloat(document.getElementById('amountInput').value)
		if (!amount || amount <= 0) {
			alert('Введите корректную сумму')
			return
		}

		if (window.currentBalanceAction === 'withdraw') {
			const snap = await database
				.ref(`users/${window.currentUser.uid}`)
				.once('value')
			if (amount > (snap.val()?.balance || 0)) {
				alert('Недостаточно средств')
				return
			}
		}

		try {
			const userRef = database.ref(`users/${window.currentUser.uid}`)
			const snap = await userRef.once('value')
			const cur = snap.val()?.balance || 0
			const newBal =
				window.currentBalanceAction === 'add' ? cur + amount : cur - amount

			await userRef.update({ balance: newBal })
			await database.ref('transactions').push({
				userId: window.currentUser.uid,
				amount: window.currentBalanceAction === 'add' ? amount : -amount,
				type: window.currentBalanceAction === 'add' ? 'deposit' : 'withdrawal',
				balance: newBal,
				timestamp: Date.now(),
			})

			window.closeBalanceModal()
			await loadUserData(window.currentUser)
			alert(
				`Баланс ${window.currentBalanceAction === 'add' ? 'пополнен' : 'списан'} на ${amount} ₽`,
			)
		} catch (e) {
			alert('Произошла ошибка.')
		}
	}

	window.sendMessage = async function () {
		const input = document.getElementById('messageInput')
		const text = input?.value.trim()
		if (!text) return

		const username =
			window.currentUser?.displayName ||
			localStorage.getItem('chatUsername') ||
			'Гость'

		try {
			await database.ref('messages').push({
				username: username,
				text: text,
				timestamp: Date.now(),
			})
			input.value = ''
			input.style.height = 'auto'
		} catch (e) {
			console.error('Ошибка отправки:', e)
			alert('Не удалось отправить сообщение: ' + e.message)
		}
	}

	window.addEventListener('click', e => {
		const modal = document.getElementById('balanceModal')
		if (e.target === modal) window.closeBalanceModal()
	})
}

window.openChatImageFullById = function (imgEl) {
	const src = imgEl.src
	document.querySelector('.chat-image-fullscreen')?.remove()
	const overlay = document.createElement('div')
	overlay.className = 'chat-image-fullscreen'
	overlay.innerHTML = `
        <div class="chat-image-fullscreen-bg" onclick="this.parentElement.remove()"></div>
        <img src="${src}" alt="фото">
        <button class="chat-image-close" onclick="this.parentElement.remove()">✕</button>`
	document.body.appendChild(overlay)
	requestAnimationFrame(() => overlay.classList.add('open'))
	document.addEventListener(
		'keydown',
		e => {
			if (e.key === 'Escape') overlay.remove()
		},
		{ once: true },
	)
}

// ========================================
// ОСНОВНЫЕ ПЕРЕМЕННЫЕ
// ========================================
let isBW = false
let slapCount = 0
let dickCount = 0
let totalHits = 0
let totalEarned = 0
let currentWeapon = 'hand'
let userCurrency = 0
const weapons = { hand: '👋', dick: 'img/penis.png' }
const targetImages = { hand: 'img/photo (2).jpg', dick: 'img/photo (4).jpg' }

// ========================================
// UPGRADE SYSTEM
// ========================================
window._factoryDumplings = 0
window._factorySandwiches = 0

let upgradeData = {
	1: { level: 0, maxLevel: 5, basePrice: 1, priceMultiplier: 2 },
	2: { level: 0, maxLevel: 5, basePrice: 1, priceMultiplier: 2 },
}

const SPEED_DELAYS = [500, 400, 310, 230, 160, 100]
let slapCooldown = false

function getIncomePerHit() {
	return +(0.1 + upgradeData[1].level * 0.1).toFixed(1)
}

function getUpgradePrice(id) {
	const u = upgradeData[id]
	return Math.round(u.basePrice * Math.pow(u.priceMultiplier, u.level))
}

function getCurrentDelay() {
	return SPEED_DELAYS[upgradeData[2].level]
}

function getNextDelay() {
	return SPEED_DELAYS[Math.min(upgradeData[2].level + 1, 5)]
}

function refreshUpgradeUI() {
	const pd = document.getElementById('panelDumplings')
	const ps = document.getElementById('panelSandwiches')
	if (pd) pd.textContent = window._factoryDumplings || 0
	if (ps) ps.textContent = window._factorySandwiches || 0

	// Update per-click display in slap stats
	const pcd = document.getElementById('perClickDisplay')
	if (pcd) pcd.textContent = getIncomePerHit()

	const u1 = upgradeData[1]
	const price1 = getUpgradePrice(1)
	const lvl1 = u1.level
	const maxed1 = lvl1 >= u1.maxLevel

	const el_lvl1 = document.getElementById('upgradeLevel1')
	const el_prog1 = document.getElementById('upgradeProgress1')
	const el_cur1 = document.getElementById('upgradeCurrentIncome')
	const el_next1 = document.getElementById('upgradeNextIncome')
	const btn1 = document.getElementById('upgradeBuyBtn1')

	if (el_lvl1) el_lvl1.textContent = `${lvl1}/${u1.maxLevel}`
	if (el_prog1) el_prog1.style.width = `${(lvl1 / u1.maxLevel) * 100}%`
	if (el_cur1) el_cur1.textContent = `+${getIncomePerHit()}`
	if (el_next1)
		el_next1.textContent = maxed1
			? 'МАКС'
			: `+${+(getIncomePerHit() + 0.1).toFixed(1)}`
	if (btn1) {
		btn1.disabled = maxed1 || (window._factoryDumplings || 0) < price1
		btn1.textContent = maxed1 ? '✅ Максимум' : `Купить за ${price1} 🥟`
	}
	if (maxed1) {
		const c = document.getElementById('upgradeCard1')
		if (c) c.classList.add('upgrade-maxed')
	}

	const u2 = upgradeData[2]
	const price2 = getUpgradePrice(2)
	const lvl2 = u2.level
	const maxed2 = lvl2 >= u2.maxLevel

	const el_lvl2 = document.getElementById('upgradeLevel2')
	const el_prog2 = document.getElementById('upgradeProgress2')
	const el_curSpd = document.getElementById('upgradeCurrentSpeed')
	const el_nextSpd = document.getElementById('upgradeNextSpeed')
	const btn2 = document.getElementById('upgradeBuyBtn2')

	if (el_lvl2) el_lvl2.textContent = `${lvl2}/${u2.maxLevel}`
	if (el_prog2) el_prog2.style.width = `${(lvl2 / u2.maxLevel) * 100}%`
	if (el_curSpd) el_curSpd.textContent = getCurrentDelay()
	if (el_nextSpd) el_nextSpd.textContent = maxed2 ? 'МАКС' : getNextDelay()
	if (btn2) {
		btn2.disabled = maxed2 || (window._factorySandwiches || 0) < price2
		btn2.textContent = maxed2 ? '✅ Максимум' : `Купить за ${price2} 🥪`
	}
	if (maxed2) {
		const c = document.getElementById('upgradeCard2')
		if (c) c.classList.add('upgrade-maxed')
	}
}

window.buyUpgrade = async function (id) {
	const u = upgradeData[id]
	if (u.level >= u.maxLevel) return
	const price = getUpgradePrice(id)

	if (id === 1) {
		if ((window._factoryDumplings || 0) < price) {
			alert('Недостаточно заводских пельменей! Иди на Завод 🏭')
			return
		}
		window._factoryDumplings -= price
	} else {
		if ((window._factorySandwiches || 0) < price) {
			alert('Недостаточно бутербродов! Иди на Завод 🏭')
			return
		}
		window._factorySandwiches -= price
	}

	upgradeData[id].level++
	await saveUpgradesToFirebase()
	refreshUpgradeUI()
}

async function saveUpgradesToFirebase() {
	if (!window.currentUser || !database) return
	try {
		await database.ref(`users/${window.currentUser.uid}`).update({
			upgradeLevel1: upgradeData[1].level,
			upgradeLevel2: upgradeData[2].level,
			sandwiches: window._factorySandwiches || 0,
			factoryDumplings: window._factoryDumplings || 0,
		})
	} catch (e) {
		console.error('Ошибка сохранения апгрейдов:', e)
	}
}

async function loadUpgradesFromFirebase(uid) {
	try {
		const snap = await database.ref(`users/${uid}`).once('value')
		if (snap.exists()) {
			const d = snap.val()
			upgradeData[1].level = d.upgradeLevel1 || 0
			upgradeData[2].level = d.upgradeLevel2 || 0
			window._factorySandwiches = d.sandwiches || 0
			window._factoryDumplings = d.factoryDumplings || 0
			refreshUpgradeUI()
			updateFactoryCurrencies()
		}
	} catch (e) {
		console.error('Ошибка загрузки апгрейдов:', e)
	}
}

// ========================================
// CASINO
// ========================================
let selectedBet = 'mouth'
let isSpinning = false
let casinoStats = { totalSpins: 0, totalWins: 0, totalLosses: 0 }

function loadCasinoStats() {
	const saved = localStorage.getItem('casinoStats')
	if (saved) {
		casinoStats = JSON.parse(saved)
		updateStatsDisplay()
	}
}

function saveCasinoStats() {
	localStorage.setItem('casinoStats', JSON.stringify(casinoStats))
}

function updateStatsDisplay() {
	document.getElementById('totalSpins').textContent = casinoStats.totalSpins
	document.getElementById('totalWins').textContent = casinoStats.totalWins
	document.getElementById('totalLosses').textContent = casinoStats.totalLosses
	const wr =
		casinoStats.totalSpins > 0
			? Math.round((casinoStats.totalWins / casinoStats.totalSpins) * 100)
			: 0
	document.getElementById('winRate').textContent = wr + '%'
}

window.openCasinoGame = function (gameName) {
	document.getElementById('casinoMenu').style.display = 'none'
	document.getElementById(gameName + 'Game').style.display = 'block'
	updateCurrencyDisplay()
	if (gameName === 'slots') updateSlotsBalance()
}

window.backToCasinoMenu = function () {
	// FIX #2: Stop float logos when going back to menu
	stopFloatLogos()
	clearInterval(ethPriceInterval)
	clearInterval(ethFakeTickInterval)

	document
		.querySelectorAll('.casino-game')
		.forEach(g => (g.style.display = 'none'))
	document.getElementById('casinoMenu').style.display = 'block'
}

window.selectBet = function (bet) {
	selectedBet = bet
	document
		.getElementById('betMouth')
		.classList.toggle('active', bet === 'mouth')
	document.getElementById('betAss').classList.toggle('active', bet === 'ass')
}

// ===== ПЕРЕМЕННЫЕ СТАВКИ (50% / ALL-IN) =====
let rouletteBetCustom = 5
let slotsBetCustom = 10
let ethBetCustom = 10

function updateSpinBtnLabel(id, amount, label) {
	const btn = document.getElementById(id)
	if (!btn) return
	btn.innerHTML = `${label} (${Math.round(amount)} <img src="img/2.png" style="width:20px;height:20px;vertical-align:middle;">)`
}

window.setRouletteBetPct = function (pct) {
	const amount = Math.max(5, Math.floor(userCurrency * pct))
	rouletteBetCustom = amount
	updateSpinBtnLabel('spinBtn', amount, 'КРУТИТЬ')
	showResult(`💰 Ставка: ${amount} (${Math.round(pct * 100)}% баланса)`, 'info')
}

window.setSlotsBetPct = function (pct) {
	const amount = Math.max(10, Math.floor(userCurrency * pct))
	slotsBetCustom = amount
	updateSpinBtnLabel('slotSpinBtn', amount, 'КРУТИТЬ')
	showSlotsResult(
		`💰 Ставка: ${amount} (${Math.round(pct * 100)}% баланса)`,
		'info',
	)
}

window.setEthBetPct = function (pct) {
	const amount = Math.max(10, Math.floor(userCurrency * pct))
	ethBetCustom = amount
	const btns = document.getElementById('ethBetButtons')
	if (btns) {
		const upBtn = btns.querySelector('[onclick*="up"]')
		const downBtn = btns.querySelector('[onclick*="down"]')
		if (upBtn)
			upBtn.innerHTML = upBtn.innerHTML
				.replace(/\d+ 🟢/, `${amount} 🟢`)
				.replace(/UP \d+/, `UP ${amount}`)
		if (downBtn)
			downBtn.innerHTML = downBtn.innerHTML
				.replace(/\d+ 🔴/, `${amount} 🔴`)
				.replace(/DOWN \d+/, `DOWN ${amount}`)
	}
	showEthResult?.(
		`💰 Ставка: ${amount} (${Math.round(pct * 100)}% баланса)`,
		'info',
	)
}

window.setRapBetPct = function (pct) {
	const amount = Math.max(5, Math.floor(userCurrency * pct))
	window.setRapBet(amount, null)
	showRapMessage?.(
		'info',
		`💰 Ставка: ${amount} (${Math.round(pct * 100)}% баланса)`,
	)
}

window.spinRoulette = async function () {
	if (isSpinning) return
	const betAmount = rouletteBetCustom || 5
	if (userCurrency < betAmount) {
		showResult('❌ Недостаточно средств! Нужно минимум ' + betAmount, 'loss')
		return
	}

	isSpinning = true
	document.getElementById('spinBtn').disabled = true
	document.getElementById('resultMessage').textContent = ''
	if (window.SND) window.SND.casinoSpin()
	addCurrency(-betAmount)

	const wheel = document.getElementById('rouletteWheel')
	const isWin = Math.random() < 0.38 // 38% шанс что угадал
	const result = isWin ? selectedBet : selectedBet === 'mouth' ? 'ass' : 'mouth'
	const segmentAngle = 45
	const baseAngle = 360 * 5
	const segments = result === 'mouth' ? [0, 2, 4, 6] : [1, 3, 5, 7]
	const idx = segments[Math.floor(Math.random() * segments.length)]
	const targetAngle = idx * segmentAngle + segmentAngle / 2
	const finalAngle = baseAngle + (360 - targetAngle)

	wheel.style.transition = 'transform 4s cubic-bezier(0.17, 0.67, 0.12, 0.99)'
	wheel.style.transform = `rotate(${finalAngle}deg)`
	await new Promise(r => setTimeout(r, 4000))

	casinoStats.totalSpins++

	if (isWin) {
		const win = betAmount * 2
		addCurrency(win)
		casinoStats.totalWins++
		if (window.SND) window.SND.casinoWin()
		showResult(
			`🎉 ВЫИГРЫШ! Выпало "${result === 'mouth' ? 'В РОТ 👄' : 'В ЖОПУ 🍑'}" +${win}`,
			'win',
		)
	} else {
		casinoStats.totalLosses++
		if (window.SND) window.SND.casinoLose()
		showResult(
			`😢 ПРОИГРЫШ! Выпало "${result === 'mouth' ? 'В РОТ 👄' : 'В ЖОПУ 🍑'}" -${betAmount}`,
			'loss',
		)
	}

	saveCasinoStats()
	updateStatsDisplay()

	setTimeout(() => {
		wheel.style.transition = 'none'
		wheel.style.transform = 'rotate(0deg)'
		isSpinning = false
		document.getElementById('spinBtn').disabled = false
	}, 2000)
}

function showResult(msg, type) {
	const el = document.getElementById('resultMessage')
	el.textContent = msg
	el.className = 'result-message ' + type + ' show'
	setTimeout(() => el.classList.remove('show'), 3000)
}

// ========================================
// CURRENCY
// ========================================
// FIX #1: Helper to create currency icon HTML
function currencyIcon(size) {
	size = size || 20
	return `<img src="img/2.png" style="width:${size}px;height:${size}px;vertical-align:middle;object-fit:contain;">`
}

function addCurrency(amount) {
	userCurrency += amount
	updateCurrencyDisplay()
	saveCurrencyToFirebase()
}

function updateCurrencyDisplay() {
	const hb = document.getElementById('headerBalance')
	const cb = document.getElementById('casinoBalance')
	const sb = document.getElementById('slotsBalance')
	const eb = document.getElementById('ethBalance')
	if (hb) hb.textContent = userCurrency.toFixed(1)
	if (cb) cb.textContent = userCurrency.toFixed(1)
	if (sb) sb.textContent = userCurrency.toFixed(1)
	if (eb) eb.textContent = userCurrency.toFixed(1)
}

async function saveCurrencyToFirebase() {
	if (!window.currentUser || !database) return
	try {
		await database
			.ref(`users/${window.currentUser.uid}`)
			.update({ balance: userCurrency })
	} catch (e) {
		console.log('Ошибка сохранения:', e)
	}
}

// ========================================
// NAVIGATION
// ========================================
window.switchTab = function (tabName, clickedBtn) {
	if (tabName === 'kick') {
		document
			.querySelectorAll('.tab-content')
			.forEach(t => t.classList.remove('active'))
		document
			.querySelectorAll('.tab-btn')
			.forEach(b => b.classList.remove('active'))
		if (clickedBtn) clickedBtn.classList.add('active')
		window.initKickGame()
		return
	}

	if (typeof window.stopKickGame === 'function') window.stopKickGame()

	// FIX #2: Always stop float logos and eth intervals when switching away from casino
	stopFloatLogos()
	clearInterval(ethPriceInterval)
	clearInterval(ethFakeTickInterval)

	document
		.querySelectorAll('.tab-content')
		.forEach(t => t.classList.remove('active'))
	document
		.querySelectorAll('.tab-btn')
		.forEach(b => b.classList.remove('active'))

	const tab = document.getElementById(tabName)
	if (tab) tab.classList.add('active')

	if (clickedBtn) {
		clickedBtn.classList.add('active')
	} else {
		document.querySelectorAll('.tab-btn').forEach(b => {
			const oc = b.getAttribute('onclick') || ''
			if (
				oc.includes("'" + tabName + "'") ||
				oc.includes('"' + tabName + '"')
			) {
				b.classList.add('active')
			}
		})
	}

	if (tabName === 'ambassadors') setTimeout(drawConnections, 100)
	if (tabName === 'casino') {
		backToCasinoMenu()
		updateCurrencyDisplay()
	}
	if (tabName === 'factory') {
		updateFactoryCurrencies()
	}
	if (tabName === 'admin') {
		window.loadAdminPanel()
	}
}

// ========================================
// GALLERY
// ========================================
window.toggleBW = function () {
	if (window.SND) window.SND.clownLaugh()
	isBW = !isBW
	document.querySelectorAll('.gallery-item').forEach((item, i) => {
		setTimeout(() => item.classList.toggle('bw', isBW), i * 50)
	})
	document.getElementById('ripMessage').classList.toggle('show', isBW)
}

window.switchMediaTab = function (subtabName) {
	document
		.querySelectorAll('.media-subtab-content')
		.forEach(t => t.classList.remove('active'))
	document
		.querySelectorAll('.subtab-btn')
		.forEach(b => b.classList.remove('active'))
	document.getElementById(subtabName).classList.add('active')
	event.target.classList.add('active')
}

// ========================================
// SLAP
// ========================================
window.toggleWeaponMenu = function (e) {
	e.stopPropagation()
	document.getElementById('weaponMiniMenu').classList.toggle('open')
}

document.addEventListener('click', function () {
	const menu = document.getElementById('weaponMiniMenu')
	if (menu) menu.classList.remove('open')
})

window.selectWeapon = function (type) {
	window.changeWeapon(type)
	document.getElementById('weaponMiniMenu').classList.remove('open')
	document.getElementById('weaponCircleIcon').innerHTML =
		type === 'hand'
			? '👋'
			: '<img src="img/penis.png" style="width:32px;height:32px;object-fit:contain;">'
}

window.openUpgradeMenu = function () {
	document.getElementById('upgradeOverlay').classList.add('open')
	document.getElementById('upgradePanel').classList.add('open')
	refreshUpgradeUI()
}

window.closeUpgradeMenu = function () {
	document.getElementById('upgradeOverlay').classList.remove('open')
	document.getElementById('upgradePanel').classList.remove('open')
}

window.changeWeapon = function (weaponType) {
	currentWeapon = weaponType
	const weaponEmoji = document.querySelector('.weapon-emoji')
	const weaponImage = document.getElementById('weaponImage')
	const targetImage = document.getElementById('targetImage')
	const counterLabel = document.getElementById('slapCounterLabel')
	const counterValue = document.getElementById('slapCounterValue')

	targetImage.src = targetImages[weaponType]

	if (weaponType === 'hand') {
		weaponEmoji.textContent = weapons[weaponType]
		weaponEmoji.style.display = 'inline-block'
		weaponImage.style.display = 'none'
		counterLabel.textContent = 'Пощечин'
		counterValue.textContent = slapCount
	} else {
		weaponEmoji.style.display = 'none'
		weaponImage.src = weapons[weaponType]
		weaponImage.style.display = 'block'
		counterLabel.textContent = 'Ударов'
		counterValue.textContent = dickCount
	}
}

window.doSlap = function () {
	if (slapCooldown) return
	if (window.SND) {
		if (window.currentWeapon === 'dick') window.SND.whoosh()
		else window.SND.slap()
	}

	const weapon = document.getElementById('weapon')
	const target = document.getElementById('slapTarget')
	const counterValue = document.getElementById('slapCounterValue')

	const animClass = currentWeapon === 'dick' ? 'sliding' : 'slapping'
	// Длительность анимации: писюн летит 2.5с, рука 1.2с
	const animDuration = currentWeapon === 'dick' ? 2500 : 1200

	// Force reflow so animation restarts if clicked fast
	weapon.classList.remove('slapping', 'sliding')
	void weapon.offsetWidth
	weapon.classList.add(animClass)

	if (currentWeapon === 'hand') {
		slapCount++
		counterValue.textContent = slapCount
	} else {
		dickCount++
		counterValue.textContent = dickCount
	}

	const income = getIncomePerHit()
	totalHits++
	totalEarned = +(totalEarned + income).toFixed(1)
	document.getElementById('totalHitsDisplay').textContent = totalHits
	document.getElementById('totalEarnedDisplay').textContent = totalEarned

	addCurrency(income)
	refreshUpgradeUI()

	const delay = getCurrentDelay()
	slapCooldown = true

	// Разблокируем кнопку по кулдауну (может быть быстрее анимации)
	setTimeout(() => {
		slapCooldown = false
	}, delay)

	// Класс убираем только после полного завершения анимации
	setTimeout(() => {
		weapon.classList.remove('slapping', 'sliding')
		target.classList.remove('slapped')
	}, animDuration)
}

// ========================================
// AMBASSADORS
// ========================================
function drawConnections() {
	const svg = document.getElementById('connectionsSvg')
	const ids = ['winner1', 'winner2', 'winner3', 'winner4', 'winner5']
	const elements = ids.map(id => document.getElementById(id))
	if (elements.some(el => !el)) return

	const container = document.querySelector('.podium-container')
	const containerRect = container.getBoundingClientRect()
	const target = elements[4]
		.querySelector('.winner-image-container')
		.getBoundingClientRect()
	const targetX = target.left + target.width / 2 - containerRect.left
	const targetY = target.top - containerRect.top

	svg.innerHTML = ''
	elements.slice(0, 4).forEach((winner, idx) => {
		const poop = winner.querySelector('.poop-icon')
		if (!poop) return
		const pr = poop.getBoundingClientRect()
		const x = pr.left + pr.width / 2 - containerRect.left
		const y = pr.top + pr.height - containerRect.top

		const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')

		// FIX #7: On mobile, use ballistic curves from sides (left/right arcs)
		const isMobile = window.innerWidth <= 768
		if (isMobile) {
			// Alternate left/right arcs for each winner
			const side = idx % 2 === 0 ? -1 : 1
			const controlX = targetX + side * (containerRect.width * 0.35)
			const midY = (y + targetY) / 2
			path.setAttribute(
				'd',
				`M ${x} ${y} Q ${controlX} ${midY} ${targetX} ${targetY}`,
			)
		} else {
			const midY = (y + targetY) / 2
			path.setAttribute(
				'd',
				`M ${x} ${y} Q ${x} ${midY}, ${(x + targetX) / 2} ${midY} T ${targetX} ${targetY}`,
			)
		}

		path.setAttribute('class', 'connection-line')
		svg.appendChild(path)
	})
}

window.addEventListener('resize', () => {
	if (document.getElementById('ambassadors').classList.contains('active'))
		drawConnections()
})

// ========================================
// CHAT SCROLL
// ========================================
window.scrollChatToBottom = function () {
	const el = document.getElementById('chatMessages')
	if (!el) return
	// Принудительно в самый низ
	el.scrollTop = el.scrollHeight + 9999
	setTimeout(() => {
		el.scrollTop = el.scrollHeight + 9999
	}, 100)
}

function checkScrollPosition() {
	const el = document.getElementById('chatMessages')
	const btn = document.getElementById('scrollToBottomBtn')
	if (!el || !btn) return
	// Показываем всегда когда чат открыт
	btn.style.display = 'flex'
}

// ========================================
// VOICES
// ========================================
let currentPlayingVoice = null

window.playVoice = function (voiceId) {
	const audio = document.getElementById(voiceId)
	const msg = document.querySelector(`[data-voice="${voiceId}"]`)
	if (!audio || !msg) return

	if (currentPlayingVoice && currentPlayingVoice !== audio) {
		currentPlayingVoice.pause()
		currentPlayingVoice.currentTime = 0
		const prev = document.querySelector(
			`[data-voice="${currentPlayingVoice.id}"]`,
		)
		if (prev) prev.classList.remove('playing')
	}

	if (audio.paused) {
		audio.play()
		msg.classList.add('playing')
		currentPlayingVoice = audio
		audio.onended = () => {
			msg.classList.remove('playing')
			currentPlayingVoice = null
		}
	} else {
		audio.pause()
		audio.currentTime = 0
		msg.classList.remove('playing')
		currentPlayingVoice = null
	}
}

// ========================================
// SLOTS
// ========================================
const SLOT_SYMBOLS = ['🍒', '🍋', '🍊', '🍇', '💎', '⭐']
const SLOT_WEIGHTS = [35, 30, 22, 18, 5, 1]
const SLOT_PAYOUTS = { '🍒': 1.5, '🍋': 2, '🍊': 2.5, '🍇': 3.5, '💎': 5 }
let slotsSpinning = false
let freespinsCount = 0
let isFreeSpinMode = false

function getWeightedSymbol() {
	const total = SLOT_WEIGHTS.reduce((a, b) => a + b, 0)
	let rand = Math.random() * total
	for (let i = 0; i < SLOT_SYMBOLS.length; i++) {
		rand -= SLOT_WEIGHTS[i]
		if (rand <= 0) return SLOT_SYMBOLS[i]
	}
	return SLOT_SYMBOLS[0]
}

function updateSlotsBalance() {
	const el = document.getElementById('slotsBalance')
	if (el) el.textContent = userCurrency.toFixed(1)
}

window.spinSlots = async function () {
	if (slotsSpinning) return
	const betAmount = slotsBetCustom || 10
	if (!isFreeSpinMode && userCurrency < betAmount) {
		showSlotsResult('❌ Недостаточно средств! Нужно ' + betAmount, 'loss')
		return
	}

	slotsSpinning = true
	document.getElementById('slotSpinBtn').disabled = true
	document.getElementById('slotsResult').textContent = ''
	if (window.SND) window.SND.casinoSpin()

	if (!isFreeSpinMode) {
		addCurrency(-betAmount)
		updateSlotsBalance()
	}

	const reels = [0, 1, 2, 3, 4].map(i => document.getElementById(`reel${i}`))
	reels.forEach(r => {
		r.classList.add('spinning')
		r.classList.remove('winner')
	})

	const results = [0, 1, 2, 3, 4].map(() => getWeightedSymbol())

	for (let i = 0; i < 5; i++) {
		await new Promise(r => setTimeout(r, 300 + i * 250))
		reels[i].classList.remove('spinning')
		reels[i].querySelector('.slot-symbol').textContent = results[i]
	}
	await new Promise(r => setTimeout(r, 300))

	const counts = {}
	results.forEach(s => {
		counts[s] = (counts[s] || 0) + 1
	})
	const maxSame = Math.max(...Object.values(counts))
	const topSymbol = Object.entries(counts).find(([, c]) => c === maxSame)?.[0]

	if (topSymbol === '⭐' && maxSame >= 3) {
		if (window.SND) window.SND.casinoBigWin()
		freespinsCount += 3
		isFreeSpinMode = true
		document.getElementById('slotsFreespinsBanner').style.display = 'block'
		document.getElementById('freespinsLeft').textContent = freespinsCount
		document.getElementById('slotSpinBtn').textContent =
			`ФРИСПИН (${freespinsCount} осталось)`
		reels.forEach(r => r.classList.add('winner'))
		showSlotsResult('⭐ БОНУС! +3 ФРИСПИНА!', 'win')
	} else if (maxSame >= 3 && SLOT_PAYOUTS[topSymbol]) {
		if (window.SND) {
			if (maxSame >= 5) window.SND.casinoBigWin()
			else window.SND.casinoWin()
		}
		const mult =
			SLOT_PAYOUTS[topSymbol] * (maxSame === 5 ? 2 : maxSame === 4 ? 1.5 : 1)
		const winAmount = Math.round(betAmount * mult)
		addCurrency(winAmount)
		updateSlotsBalance()
		reels.forEach((r, i) => {
			if (results[i] === topSymbol) r.classList.add('winner')
		})
		showSlotsResult(`🎉 ${topSymbol}x${maxSame}! +${winAmount}`, 'win')
	} else if (maxSame >= 2 && Math.random() < 0.3) {
		// только 30% шанс даже при 2 одинаковых
		const winAmount = Math.round(betAmount * 0.3)
		if (window.SND) window.SND.casinoWin()
		addCurrency(winAmount)
		updateSlotsBalance()
		showSlotsResult(`🃏 Почти! Возврат ${winAmount}`, 'win')
	} else {
		if (window.SND) window.SND.casinoLose()
		showSlotsResult('😢 Не повезло!', 'loss')
	}

	if (isFreeSpinMode && topSymbol !== '⭐') {
		freespinsCount--
		document.getElementById('freespinsLeft').textContent = freespinsCount
		document.getElementById('slotSpinBtn').textContent =
			`ФРИСПИН (${freespinsCount} осталось)`
		if (freespinsCount <= 0) {
			isFreeSpinMode = false
			document.getElementById('slotsFreespinsBanner').style.display = 'none'
			document.getElementById('slotSpinBtn').textContent = 'КРУТИТЬ (10)'
		}
	}

	slotsSpinning = false
	document.getElementById('slotSpinBtn').disabled = false
	updateSlotsBalance()
}

function showSlotsResult(msg, type) {
	const el = document.getElementById('slotsResult')
	el.textContent = msg
	el.className = 'result-message ' + type + ' show'
	setTimeout(() => el.classList.remove('show'), 3000)
}

// ========================================
// AI CHAT
// ========================================
let aiConversationHistory = []
const AI_API_URL = 'https://my-ai-server-14sv.vercel.app/api/chat'

window.clearAIChat = function () {
	document.getElementById('aiChatMessages').innerHTML = `
		<div class="ai-welcome-message">
			<div class="ai-welcome-icon">👋</div>
			<h3>Привет! Я ваш ИИ помощник</h3>
			<p>Работаю на Claude AI и готов помочь с любыми вопросами!</p>
			<div class="ai-suggestions">
				<button onclick="sendAISuggestion('Расскажи анекдот')" class="ai-suggestion">😄 Расскажи анекдот</button>
				<button onclick="sendAISuggestion('Помоги с кодом')" class="ai-suggestion">💻 Помоги с кодом</button>
				<button onclick="sendAISuggestion('Дай совет')" class="ai-suggestion">💡 Дай совет</button>
			</div>
		</div>`
	aiConversationHistory = []
}

window.sendAISuggestion = function (text) {
	document.getElementById('aiMessageInput').value = text
	sendAIMessage()
}

window.sendAIMessage = async function () {
	const input = document.getElementById('aiMessageInput')
	const text = input.value.trim()
	if (!text) return

	const container = document.getElementById('aiChatMessages')
	const sendBtn = document.getElementById('aiSendBtn')

	container.querySelector('.ai-welcome-message')?.remove()

	container.insertAdjacentHTML(
		'beforeend',
		`
		<div class="ai-message user-message">
			<div class="ai-message-content"><div class="ai-message-text">${escapeHtml(text)}</div></div>
			<div class="ai-message-avatar">👤</div>
		</div>`,
	)

	input.value = ''
	input.style.height = 'auto'
	sendBtn.disabled = true

	const loadingDiv = document.createElement('div')
	loadingDiv.className = 'ai-message assistant-message'
	loadingDiv.innerHTML = `
		<div class="ai-message-avatar">🤖</div>
		<div class="ai-message-content">
			<div class="ai-typing-indicator"><span></span><span></span><span></span></div>
		</div>`
	container.appendChild(loadingDiv)
	container.scrollTop = container.scrollHeight

	aiConversationHistory.push({ role: 'user', content: text })

	try {
		const res = await fetch(AI_API_URL, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ messages: aiConversationHistory }),
		})
		if (!res.ok) throw new Error(`HTTP ${res.status}`)
		const data = await res.json()
		const msg =
			data.content?.[0]?.text ||
			data.message ||
			(typeof data === 'string' ? data : 'Нет ответа')
		aiConversationHistory.push({ role: 'assistant', content: msg })
		loadingDiv.remove()
		container.insertAdjacentHTML(
			'beforeend',
			`
			<div class="ai-message assistant-message">
				<div class="ai-message-avatar">🤖</div>
				<div class="ai-message-content"><div class="ai-message-text">${formatAIMessage(msg)}</div></div>
			</div>`,
		)
	} catch (err) {
		loadingDiv.remove()
		container.insertAdjacentHTML(
			'beforeend',
			`
			<div class="ai-message assistant-message error-message">
				<div class="ai-message-avatar">⚠️</div>
				<div class="ai-message-content"><div class="ai-message-text">Ошибка: ${err.message}</div></div>
			</div>`,
		)
		aiConversationHistory.pop()
	} finally {
		sendBtn.disabled = false
		container.scrollTop = container.scrollHeight
	}
}

function escapeHtml(text) {
	const div = document.createElement('div')
	div.textContent = text
	return div.innerHTML
}

function formatAIMessage(text) {
	let f = escapeHtml(text)
	f = f.replace(/```(\w+)?\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>')
	f = f.replace(/`([^`]+)`/g, '<code>$1</code>')
	f = f.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
	f = f.replace(/\*([^*]+)\*/g, '<em>$1</em>')
	f = f.replace(/\n/g, '<br>')
	return f
}

// ========================================
// DOM READY
// ========================================
document.addEventListener('DOMContentLoaded', () => {
	const messageInput = document.getElementById('messageInput')
	const chatMessages = document.getElementById('chatMessages')
	const aiInput = document.getElementById('aiMessageInput')

	if (messageInput) {
		messageInput.addEventListener('keypress', e => {
			if (e.key === 'Enter' && !e.shiftKey) {
				e.preventDefault()
				window.sendMessage?.()
			}
		})
		messageInput.addEventListener('input', function () {
			this.style.height = 'auto'
			this.style.height = Math.min(this.scrollHeight, 120) + 'px'
		})
	}

	if (chatMessages) chatMessages.addEventListener('scroll', checkScrollPosition)

	if (aiInput) {
		aiInput.addEventListener('keypress', e => {
			if (e.key === 'Enter' && !e.shiftKey) {
				e.preventDefault()
				sendAIMessage()
			}
		})
		aiInput.addEventListener('input', function () {
			this.style.height = 'auto'
			this.style.height = Math.min(this.scrollHeight, 120) + 'px'
		})
	}

	// FIX #5: Prevent pinch zoom on slap target area
	const slapTarget = document.getElementById('slapTarget')
	if (slapTarget) {
		slapTarget.addEventListener(
			'touchstart',
			e => {
				if (e.touches.length > 1) e.preventDefault()
			},
			{ passive: false },
		)
		slapTarget.addEventListener(
			'touchmove',
			e => {
				e.preventDefault()
			},
			{ passive: false },
		)
	}

	// Also prevent zoom on slap button
	const slapBtn = document.querySelector('.slap-btn')
	if (slapBtn) {
		slapBtn.addEventListener(
			'touchstart',
			e => {
				e.preventDefault()
				window.doSlap()
			},
			{ passive: false },
		)
	}

	loadCasinoStats()
})

// ========================================
// FACTORY (ЗАВОД)
// ========================================
let factoryChoice = null
let factoryRunning = false

function updateFactoryCurrencies() {
	const d = document.getElementById('factoryDumpling')
	const s = document.getElementById('factorySandwich')
	if (d) d.textContent = window._factoryDumplings || 0
	if (s) s.textContent = window._factorySandwiches || 0
}

window.startConveyor = function () {
	if (factoryRunning) return
	if (userCurrency < 10) {
		alert('Недостаточно пельменей! Нужно 10')
		return
	}

	factoryRunning = true
	if (window.SND) window.SND.conveyorStart()
	addCurrency(-10)
	updateFactoryCurrencies()

	const btn = document.getElementById('startConveyorBtn')
	const photo = document.getElementById('conveyorPhoto')
	const pressArm = document.getElementById('pressArm')
	const balykResult = document.getElementById('balykResult')
	const arrow1 = document.getElementById('arrow1')

	btn.disabled = true
	photo.className = 'conveyor-photo'
	balykResult.className = 'balyk-result'
	pressArm.className = 'press-arm'

	setTimeout(() => {
		photo.classList.add('moving')
	}, 100)
	setTimeout(() => {
		pressArm.classList.add('pressing')
	}, 1800)
	setTimeout(() => {
		photo.classList.add('pressed')
	}, 2000)
	setTimeout(() => {
		balykResult.classList.add('show')
	}, 2500)
	setTimeout(() => {
		arrow1.classList.remove('hidden')
		document.getElementById('stageChoice').classList.remove('hidden')
		factoryRunning = false
		btn.disabled = false
	}, 3500)
}

window.makeChoice = function (choice) {
	factoryChoice = choice
	const finalScene = document.getElementById('finalScene')
	const finalTitle = document.getElementById('finalTitle')
	const finalBtn = document.getElementById('finalActionBtn')

	if (choice === 'ball') {
		finalTitle.textContent = '🎯 Этап 3 — Лепим пельмень!'
		finalScene.textContent = '🟤'
		finalBtn.textContent = 'Завернуть в тесто (10)'
	} else {
		finalTitle.textContent = '🎯 Этап 3 — Делаем бутерброд!'
		finalScene.textContent = '🥩🍞'
		finalBtn.textContent = 'Нарезать и подать! (10)'
	}

	document.getElementById('arrow2').classList.remove('hidden')
	document.getElementById('stageFinal').classList.remove('hidden')
}

window.scrollToStage = function (stageId) {
	const el = document.getElementById(stageId)
	if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

window.doFinalAction = function () {
	if (window.SND) window.SND.factoryPress()
	const resultMsg = document.getElementById('factoryResultMsg')
	const resetBtn = document.getElementById('resetFactoryBtn')
	const finalBtn = document.getElementById('finalActionBtn')

	if (userCurrency < 10) {
		alert('Недостаточно! Нужно 10')
		return
	}

	addCurrency(-10)

	if (factoryChoice === 'ball') {
		window._factoryDumplings = (window._factoryDumplings || 0) + 1
		resultMsg.textContent = '🥟 +1 заводской пельмень! (Трать в прокачке)'
	} else {
		window._factorySandwiches = (window._factorySandwiches || 0) + 1
		resultMsg.textContent = '🥪 +1 бутерброд! Вкусно получилось!'
	}

	saveUpgradesToFirebase()
	refreshUpgradeUI()
	updateFactoryCurrencies()

	resultMsg.classList.remove('hidden')
	finalBtn.disabled = true
	resetBtn.classList.remove('hidden')
}

window.resetFactory = function () {
	document.getElementById('stageChoice').classList.add('hidden')
	document.getElementById('stageFinal').classList.add('hidden')
	document.getElementById('arrow1').classList.add('hidden')
	document.getElementById('arrow2').classList.add('hidden')
	document.getElementById('factoryResultMsg').classList.add('hidden')
	document.getElementById('resetFactoryBtn').classList.add('hidden')
	document.getElementById('finalActionBtn').disabled = false

	const photo = document.getElementById('conveyorPhoto')
	const pressArm = document.getElementById('pressArm')
	const balykResult = document.getElementById('balykResult')
	photo.className = 'conveyor-photo'
	pressArm.className = 'press-arm'
	balykResult.className = 'balyk-result'

	factoryChoice = null
	updateFactoryCurrencies()

	document
		.getElementById('stageConveyor')
		.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

// ========================================
// ETH TRADER
// ========================================
let ethCandles = []
let ethCurrentCandle = null
let ethBetDirection = null
let ethBetPrice = null
let ethBetActive = false
let ethTimerInterval = null
let ethPriceInterval = null
let ethStats = { total: 0, wins: 0, losses: 0 }
let currentEthPair = 'ETHUSDT'
let ethLastPrice = null
let ethZoom = 60
let ethBetSeconds = 10
let currentCandleInterval = '1m'
let ethFakeTickInterval = null

const PAIR_LABELS = {
	ETHUSDT: 'Ethereum / USD',
	BTCUSDT: 'Bitcoin / USD',
	SOLUSDT: 'Solana / USD',
	BNBUSDT: 'BNB / USD',
}
const PAIR_SHORT = {
	ETHUSDT: 'ETH/USD',
	BTCUSDT: 'BTC/USD',
	SOLUSDT: 'SOL/USD',
	BNBUSDT: 'BNB/USD',
}
const PAIR_LOGOS = {
	ETHUSDT: ['⟠', 'Ξ', '⟠', 'Ξ', '◈', '⟠', 'Ξ'],
	BTCUSDT: ['₿', '🟡', '₿', '🟡', '⚡', '₿', '🟡'],
	SOLUSDT: ['◎', '🌊', '◎', '🌊', '⬡', '◎', '🌊'],
	BNBUSDT: ['🔶', '◆', '🔶', '◆', '⬡', '🔶', '◆'],
}

const INTERVAL_MAP = {
	'5s': '1m',
	'15s': '1m',
	'1m': '1m',
	'5m': '5m',
	'15m': '15m',
}
const INTERVAL_LABELS = {
	'5s': '5с',
	'15s': '15с',
	'1m': '1м',
	'5m': '5м',
	'15m': '15м',
}
const CANDLE_MS = {
	'5s': 5000,
	'15s': 15000,
	'1m': 60000,
	'5m': 300000,
	'15m': 900000,
}

// FIX #2 & #6: Float logos only in safe zone (not over buttons/chart)
// Track if eth game is active
let ethGameActive = false

function spawnFloatLogo() {
	if (!ethGameActive) return

	const logos = PAIR_LOGOS[currentEthPair] || ['⟠']
	const logo = logos[Math.floor(Math.random() * logos.length)]
	const el = document.createElement('span')
	el.className = 'eth-float-logo'
	el.textContent = logo

	// FIX #6: Only spawn on far left/right edges to avoid covering buttons
	const side = Math.random() < 0.5
	const x = side ? Math.random() * 8 : 92 + Math.random() * 8
	const size = 1.0 + Math.random() * 1.4
	const dur = 6 + Math.random() * 8

	el.style.cssText = `
		position: fixed;
		left: ${x}%;
		bottom: ${10 + Math.random() * 40}px;
		font-size: ${size}rem;
		animation: floatLogoFixed ${dur}s linear forwards;
		z-index: 0;
		pointer-events: none;
		user-select: none;
		filter: drop-shadow(0 0 6px rgba(98,126,234,0.5));
		opacity: 0;
	`
	document.body.appendChild(el)
	setTimeout(() => el.remove(), dur * 1000)
}

let floatLogoTimer = null
function startFloatLogos() {
	stopFloatLogos()
	ethGameActive = true
	spawnFloatLogo()
	spawnFloatLogo()
	floatLogoTimer = setInterval(() => {
		if (!ethGameActive) return
		spawnFloatLogo()
		if (Math.random() < 0.4) spawnFloatLogo()
	}, 1200)
}
function stopFloatLogos() {
	ethGameActive = false
	clearInterval(floatLogoTimer)
	floatLogoTimer = null
	document.querySelectorAll('.eth-float-logo').forEach(e => e.remove())
}

function initEthZoom() {
	const canvas = document.getElementById('ethChart')
	if (!canvas || canvas._zoomInited) return
	canvas._zoomInited = true

	canvas.addEventListener(
		'wheel',
		e => {
			e.preventDefault()
			ethZoom =
				e.deltaY < 0 ? Math.max(10, ethZoom - 5) : Math.min(150, ethZoom + 5)
			updateZoomDisplay()
			drawCandleChart()
		},
		{ passive: false },
	)

	let lastPinchDist = null
	canvas.addEventListener(
		'touchmove',
		e => {
			if (e.touches.length === 2) {
				e.preventDefault()
				const dx = e.touches[0].clientX - e.touches[1].clientX
				const dy = e.touches[0].clientY - e.touches[1].clientY
				const dist = Math.sqrt(dx * dx + dy * dy)
				if (lastPinchDist !== null) {
					ethZoom = Math.max(
						10,
						Math.min(150, ethZoom - Math.round((dist - lastPinchDist) / 5)),
					)
					updateZoomDisplay()
					drawCandleChart()
				}
				lastPinchDist = dist
			}
		},
		{ passive: false },
	)
	canvas.addEventListener('touchend', () => {
		lastPinchDist = null
	})
}

function updateZoomDisplay() {
	const el = document.getElementById('ethZoomValue')
	if (el) el.textContent = ethZoom + ' св.'
}
window.ethZoomIn = () => {
	ethZoom = Math.max(10, ethZoom - 10)
	updateZoomDisplay()
	drawCandleChart()
}
window.ethZoomOut = () => {
	ethZoom = Math.min(150, ethZoom + 10)
	updateZoomDisplay()
	drawCandleChart()
}
window.ethZoomReset = () => {
	ethZoom = 60
	updateZoomDisplay()
	drawCandleChart()
}

window.switchCandleInterval = function (interval, btn) {
	currentCandleInterval = interval
	clearInterval(ethFakeTickInterval)
	ethCandles = []
	ethCurrentCandle = null

	document
		.querySelectorAll('.eth-candle-btn')
		.forEach(b => b.classList.remove('active'))
	btn.classList.add('active')
	const lbl = document.getElementById('ethChartIntervalLabel')
	if (lbl) lbl.textContent = INTERVAL_LABELS[interval] + ' · live'

	loadHistoricalCandles()
}

window.selectEthPeriod = function (seconds, btn) {
	ethBetSeconds = seconds
	document
		.querySelectorAll('.eth-period-btn')
		.forEach(b => b.classList.remove('active'))
	btn.classList.add('active')
	const label = seconds < 60 ? seconds + ' сек' : '1 мин'
	const s1 = document.getElementById('ethBetSubUp')
	const s2 = document.getElementById('ethBetSubDown')
	if (s1) s1.textContent = `ставка 10 · ${label} · x2`
	if (s2) s2.textContent = `ставка 10 · ${label} · x2`
}

window.switchCryptoPair = function (pair, btn) {
	currentEthPair = pair
	ethCandles = []
	ethCurrentCandle = null
	ethLastPrice = null
	document
		.querySelectorAll('.eth-pair-btn')
		.forEach(b => b.classList.remove('active'))
	btn.classList.add('active')
	const pl = document.getElementById('ethPairLabel')
	if (pl) pl.textContent = PAIR_LABELS[pair]
	const cl = document.getElementById('ethChartPairName')
	if (cl) cl.textContent = PAIR_SHORT[pair]
	document.getElementById('ethCurrentPrice').textContent = 'Загрузка...'
	document.getElementById('ethPriceChange').textContent = ''
	;['ethLow', 'ethHigh', 'ethVolume'].forEach(id => {
		const e = document.getElementById(id)
		if (e) e.textContent = '—'
	})
	if (ethGameActive) {
		stopFloatLogos()
		startFloatLogos()
	}
	loadHistoricalCandles()
	updateEthDisplay()
}

async function loadHistoricalCandles() {
	try {
		const apiInterval = INTERVAL_MAP[currentCandleInterval]
		const limit =
			currentCandleInterval === '5s' || currentCandleInterval === '15s'
				? 20
				: 100
		const res = await fetch(
			`https://api.binance.com/api/v3/klines?symbol=${currentEthPair}&interval=${apiInterval}&limit=${limit}`,
		)
		const data = await res.json()

		if (currentCandleInterval === '5s' || currentCandleInterval === '15s') {
			const sliceMs = CANDLE_MS[currentCandleInterval]
			const result = []
			for (const k of data) {
				const start = parseInt(k[0])
				const open = parseFloat(k[1])
				const close = parseFloat(k[4])
				const high = parseFloat(k[2])
				const low = parseFloat(k[3])
				const parts = Math.floor(60000 / sliceMs)
				for (let i = 0; i < parts; i++) {
					const t = start + i * sliceMs
					const ratio = i / parts
					const pOpen =
						open +
						(close - open) * ratio +
						(Math.random() - 0.5) * (high - low) * 0.15
					const pClose =
						open +
						(close - open) * (ratio + 1 / parts) +
						(Math.random() - 0.5) * (high - low) * 0.15
					const pHigh =
						Math.max(pOpen, pClose) + Math.random() * (high - low) * 0.08
					const pLow =
						Math.min(pOpen, pClose) - Math.random() * (high - low) * 0.08
					result.push({
						time: t,
						open: pOpen,
						high: pHigh,
						low: pLow,
						close: pClose,
					})
				}
			}
			ethCandles = result.slice(0, -1)
			ethCurrentCandle = result[result.length - 1] || null
		} else {
			ethCandles = data.map(k => ({
				time: parseInt(k[0]),
				open: parseFloat(k[1]),
				high: parseFloat(k[2]),
				low: parseFloat(k[3]),
				close: parseFloat(k[4]),
			}))
			ethCurrentCandle = ethCandles.pop()
		}
		drawCandleChart()

		if (currentCandleInterval === '5s' || currentCandleInterval === '15s') {
			clearInterval(ethFakeTickInterval)
			ethFakeTickInterval = setInterval(() => {
				if (!ethCurrentCandle || !ethLastPrice) return
				const now = Date.now()
				if (now - ethCurrentCandle.time >= CANDLE_MS[currentCandleInterval]) {
					ethCandles.push({ ...ethCurrentCandle })
					if (ethCandles.length > 150) ethCandles.shift()
					ethCurrentCandle = {
						time: now,
						open: ethLastPrice,
						high: ethLastPrice,
						low: ethLastPrice,
						close: ethLastPrice,
					}
					drawCandleChart()
				}
			}, 1000)
		}
	} catch (e) {
		console.error('Klines error:', e)
	}
}

async function fetchEthPrice() {
	try {
		const [tickerRes, statsRes] = await Promise.all([
			fetch(
				`https://api.binance.com/api/v3/ticker/price?symbol=${currentEthPair}`,
			),
			fetch(
				`https://api.binance.com/api/v3/ticker/24hr?symbol=${currentEthPair}`,
			),
		])
		const ticker = await tickerRes.json()
		const stats = await statsRes.json()
		return {
			price: parseFloat(ticker.price),
			low: parseFloat(stats.lowPrice),
			high: parseFloat(stats.highPrice),
			volume: parseFloat(stats.volume),
		}
	} catch (e) {
		return null
	}
}

function formatPrice(p) {
	if (p >= 1000)
		return (
			'$' +
			p.toLocaleString('en-US', {
				minimumFractionDigits: 2,
				maximumFractionDigits: 2,
			})
		)
	if (p >= 1) return '$' + p.toFixed(3)
	return '$' + p.toFixed(5)
}
function formatVolume(v) {
	if (v >= 1e6) return (v / 1e6).toFixed(1) + 'M'
	if (v >= 1e3) return (v / 1e3).toFixed(1) + 'K'
	return v.toFixed(0)
}

function drawCandleChart() {
	const canvas = document.getElementById('ethChart')
	if (!canvas) return
	const rect = canvas.getBoundingClientRect()
	canvas.width = rect.width || 900
	canvas.height = rect.height || 500

	const ctx = canvas.getContext('2d')
	const W = canvas.width,
		H = canvas.height

	const all = [...ethCandles]
	if (ethCurrentCandle) all.push(ethCurrentCandle)
	if (all.length < 2) {
		ctx.fillStyle = '#0d1117'
		ctx.fillRect(0, 0, W, H)
		return
	}

	const visible = Math.min(all.length, ethZoom)
	const candles = all.slice(-visible)

	const prices = candles.flatMap(c => [c.high, c.low])
	const minP = Math.min(...prices),
		maxP = Math.max(...prices)
	const pad = (maxP - minP) * 0.06
	const lo = minP - pad,
		hi = maxP + pad,
		range = hi - lo || 1

	const pT = 20,
		pB = 36,
		pL = 6,
		pR = 70
	const cW = W - pL - pR,
		cH = H - pT - pB
	const toY = p => pT + cH - ((p - lo) / range) * cH
	const slotW = cW / candles.length
	const bodyW = Math.max(2, Math.floor(slotW * 0.62))

	ctx.fillStyle = '#0d1117'
	ctx.fillRect(0, 0, W, H)

	const gN = 6
	for (let i = 0; i <= gN; i++) {
		const y = pT + (cH / gN) * i
		const p = hi - (range / gN) * i
		ctx.strokeStyle = 'rgba(255,255,255,0.04)'
		ctx.lineWidth = 1
		ctx.setLineDash([3, 5])
		ctx.beginPath()
		ctx.moveTo(pL, y)
		ctx.lineTo(W - pR, y)
		ctx.stroke()
		ctx.setLineDash([])
		ctx.fillStyle = 'rgba(255,255,255,0.3)'
		ctx.font = '11px Inter,sans-serif'
		ctx.textAlign = 'left'
		ctx.fillText(formatPrice(p), W - pR + 5, y + 4)
	}

	ctx.strokeStyle = 'rgba(255,255,255,0.03)'
	ctx.lineWidth = 1
	const vstep = Math.max(1, Math.floor(candles.length / 8))
	candles.forEach((c, i) => {
		if (i % vstep === 0) {
			const cx = pL + i * slotW + slotW / 2
			ctx.beginPath()
			ctx.moveTo(cx, pT)
			ctx.lineTo(cx, pT + cH)
			ctx.stroke()
		}
	})

	candles.forEach((c, i) => {
		const cx = pL + i * slotW + slotW / 2
		const isUp = c.close >= c.open
		const col = isUp ? '#26a69a' : '#ef5350'
		const colD = isUp ? 'rgba(38,166,154,0.7)' : 'rgba(239,83,80,0.7)'
		const bTop = toY(Math.max(c.open, c.close))
		const bBot = toY(Math.min(c.open, c.close))
		const bH = Math.max(1.5, bBot - bTop)
		ctx.strokeStyle = colD
		ctx.lineWidth = Math.max(1, bodyW * 0.18)
		ctx.beginPath()
		ctx.moveTo(cx, toY(c.high))
		ctx.lineTo(cx, toY(c.low))
		ctx.stroke()
		ctx.fillStyle = col
		ctx.fillRect(cx - bodyW / 2, bTop, bodyW, bH)
		if (i === candles.length - 1) {
			ctx.strokeStyle = 'rgba(255,215,0,0.9)'
			ctx.lineWidth = 1.2
			ctx.strokeRect(cx - bodyW / 2 - 0.5, bTop - 0.5, bodyW + 1, bH + 1)
		}
	})

	if (ethCurrentCandle) {
		const cy = toY(ethCurrentCandle.close)
		ctx.setLineDash([6, 4])
		ctx.strokeStyle = 'rgba(255,215,0,0.5)'
		ctx.lineWidth = 1
		ctx.beginPath()
		ctx.moveTo(pL, cy)
		ctx.lineTo(W - pR, cy)
		ctx.stroke()
		ctx.setLineDash([])
		const tW = pR - 3,
			tx = W - pR + 1,
			ty = cy - 11,
			r = 4
		ctx.fillStyle = '#FFD700'
		ctx.beginPath()
		ctx.moveTo(tx + r, ty)
		ctx.lineTo(tx + tW - r, ty)
		ctx.quadraticCurveTo(tx + tW, ty, tx + tW, ty + r)
		ctx.lineTo(tx + tW, ty + 22 - r)
		ctx.quadraticCurveTo(tx + tW, ty + 22, tx + tW - r, ty + 22)
		ctx.lineTo(tx + r, ty + 22)
		ctx.quadraticCurveTo(tx, ty + 22, tx, ty + 22 - r)
		ctx.lineTo(tx, ty + r)
		ctx.quadraticCurveTo(tx, ty, tx + r, ty)
		ctx.closePath()
		ctx.fill()
		ctx.fillStyle = '#000'
		ctx.font = 'bold 10px Inter,sans-serif'
		ctx.textAlign = 'center'
		ctx.fillText(formatPrice(ethCurrentCandle.close), tx + tW / 2, cy + 4)
	}

	ctx.fillStyle = 'rgba(255,255,255,0.22)'
	ctx.font = '9px Inter,sans-serif'
	ctx.textAlign = 'center'
	candles.forEach((c, i) => {
		if (i % vstep === 0 || i === candles.length - 1) {
			const cx = pL + i * slotW + slotW / 2
			const t = new Date(c.time)
			ctx.fillText(
				t.getHours().toString().padStart(2, '0') +
					':' +
					t.getMinutes().toString().padStart(2, '0'),
				cx,
				H - 8,
			)
		}
	})
}

window.addEventListener('resize', () => {
	if (document.getElementById('ethGame')?.style.display !== 'none')
		drawCandleChart()
})

async function updateEthDisplay() {
	const data = await fetchEthPrice()
	if (!data) return
	const { price, low, high, volume } = data
	const now = Date.now()

	if (!ethCurrentCandle) {
		ethCurrentCandle = {
			time: now,
			open: price,
			high: price,
			low: price,
			close: price,
		}
	} else {
		ethCurrentCandle.close = price
		ethCurrentCandle.high = Math.max(ethCurrentCandle.high, price)
		ethCurrentCandle.low = Math.min(ethCurrentCandle.low, price)
		if (['1m', '5m', '15m'].includes(currentCandleInterval)) {
			if (now - ethCurrentCandle.time >= CANDLE_MS[currentCandleInterval]) {
				ethCandles.push({ ...ethCurrentCandle })
				if (ethCandles.length > 150) ethCandles.shift()
				ethCurrentCandle = {
					time: now,
					open: price,
					high: price,
					low: price,
					close: price,
				}
			}
		}
	}

	ethLastPrice = price
	drawCandleChart()

	const s = (id, v) => {
		const e = document.getElementById(id)
		if (e) e.textContent = v
	}
	s('ethCurrentPrice', formatPrice(price))
	s('ethBalance', userCurrency.toFixed(1))
	s('ethLow', formatPrice(low))
	s('ethHigh', formatPrice(high))
	s('ethVolume', formatVolume(volume))

	const prev = ethLastPrice
	if (prev && prev !== price) {
		const diff = price - prev
		const pct = ((diff / prev) * 100).toFixed(4)
		const sign = diff >= 0 ? '+' : ''
		const chEl = document.getElementById('ethPriceChange')
		if (chEl) {
			chEl.textContent = `${sign}${diff.toFixed(price >= 100 ? 2 : 5)} (${sign}${pct}%)`
			chEl.className = 'eth-price-change ' + (diff >= 0 ? 'up' : 'down')
		}
	}
}

function showEthResult(msg, type) {
	const el = document.getElementById('ethResult')
	if (!el) return
	el.textContent = msg
	el.className = 'result-message ' + type + ' show'
	setTimeout(() => el.classList.remove('show'), 5000)
}
function endEthBet() {
	ethBetActive = false
	ethBetPrice = null
	ethBetDirection = null
	clearInterval(ethTimerInterval)
	const btns = document.getElementById('ethBetButtons'),
		tw = document.getElementById('ethTimerWrap')
	if (btns) {
		btns.style.display = 'flex'
		btns.querySelectorAll('button').forEach(b => (b.disabled = false))
	}
	if (tw) tw.style.display = 'none'
}
window.placEthBet = async function (direction) {
	if (ethBetActive) return
	const bet = ethBetCustom || 10
	if (userCurrency < bet) {
		showEthResult('❌ Недостаточно средств! Нужно ' + bet, 'loss')
		return
	}
	const data = await fetchEthPrice()
	if (!data) {
		showEthResult('❌ Ошибка получения курса', 'loss')
		return
	}

	addCurrency(-bet)
	ethBetActive = true
	ethBetDirection = direction
	ethBetPrice = data.price

	const btns = document.getElementById('ethBetButtons'),
		tw = document.getElementById('ethTimerWrap'),
		tel = document.getElementById('ethTimer')
	if (btns) btns.querySelectorAll('button').forEach(b => (b.disabled = true))
	if (tw) tw.style.display = 'block'

	let sec = ethBetSeconds
	if (tel) tel.textContent = sec
	ethTimerInterval = setInterval(() => {
		sec--
		if (tel) tel.textContent = sec
		if (sec <= 0) clearInterval(ethTimerInterval)
	}, 1000)

	setTimeout(
		async () => {
			const nd = await fetchEthPrice()
			if (!nd || !ethBetActive) return
			const moved = nd.price - ethBetPrice
			const won =
				(ethBetDirection === 'up' && moved > 0) ||
				(ethBetDirection === 'down' && moved < 0)
			if (won) {
				addCurrency(bet * 2)
				ethStats.wins++
				showEthResult(
					`🎉 УГАДАЛ! ${ethBetDirection === 'up' ? '📈' : '📉'} | ${formatPrice(ethBetPrice)} → ${formatPrice(nd.price)} | +${bet * 2}`,
					'win',
				)
			} else {
				ethStats.losses++
				showEthResult(
					`😢 Не угадал! ${moved >= 0 ? '📈' : '📉'} | ${formatPrice(ethBetPrice)} → ${formatPrice(nd.price)} | -${bet}`,
					'loss',
				)
			}
			ethStats.total++
			saveEthStats()
			updateEthStats()
			endEthBet()
		},
		ethBetSeconds * 1000 + 500,
	)
}

function saveEthStats() {
	localStorage.setItem('ethStats', JSON.stringify(ethStats))
}
function loadEthStats() {
	const s = localStorage.getItem('ethStats')
	if (s) ethStats = JSON.parse(s)
	updateEthStats()
}
function updateEthStats() {
	const s = (id, v) => {
		const e = document.getElementById(id)
		if (e) e.textContent = v
	}
	s('ethTotalGames', ethStats.total)
	s('ethWins', ethStats.wins)
	s('ethLosses', ethStats.losses)
	s(
		'ethWinRate',
		ethStats.total > 0
			? Math.round((ethStats.wins / ethStats.total) * 100) + '%'
			: '0%',
	)
}

// Override openCasinoGame and backToCasinoMenu for eth
const _origOpenCasino = window.openCasinoGame
window.openCasinoGame = function (gameName) {
	_origOpenCasino(gameName)
	if (gameName === 'eth') {
		ethGameActive = true
		loadEthStats()
		loadHistoricalCandles()
		updateEthDisplay()
		startFloatLogos()
		initEthZoom()
		ethPriceInterval = setInterval(updateEthDisplay, 3000)
	}
}

// backToCasinoMenu already handles stopFloatLogos above

// ========================================
// KICK THE DIMA
// ========================================
;(function () {
	'use strict'

	let kickCanvas, kickCtx
	let animFrame = null
	let selectedWeapon = 'bat'
	let mouse = { x: 300, y: 300, px: 300, py: 300, down: false }
	let swingCooldown = 0
	let hitParticles = []
	let screenShake = 0
	let roomW = 800,
		roomH = 500
	let dimaFaceImg = null
	let isSwinging = false
	let swingTimer = 0
	let weaponAngle = 0
	let floatingTexts = []
	let lastTime = 0

	const GRAVITY = 0.42
	const DAMPING = 0.99
	const FLOOR_RATIO = 0.87
	const FLOOR_BOUNCE = 0.62
	const FLOOR_FRIC = 0.7
	const ITER = 6
	const POWER = 11.0
	const UP_MULT = 5.8

	let nodes = [],
		constraints = []
	const N = {
		HEAD: 0,
		NECK: 1,
		CHEST: 2,
		BELLY: 3,
		HIPS: 4,
		LS: 5,
		RS: 6,
		LE: 7,
		RE: 8,
		LH: 9,
		RH: 10,
		LHip: 11,
		RHip: 12,
		LK: 13,
		RK: 14,
		LF: 15,
		RF: 16,
	}

	function mkNode(x, y) {
		return { x, y, px: x, py: y }
	}
	function distN(a, b) {
		const dx = nodes[a].x - nodes[b].x,
			dy = nodes[a].y - nodes[b].y
		return Math.sqrt(dx * dx + dy * dy)
	}

	function buildRagdoll() {
		nodes = []
		constraints = []
		const cx = roomW / 2,
			cy = roomH * 0.3,
			s = roomH * 0.065
		nodes[N.HEAD] = mkNode(cx, cy - s * 3.6)
		nodes[N.NECK] = mkNode(cx, cy - s * 2.7)
		nodes[N.CHEST] = mkNode(cx, cy - s * 1.5)
		nodes[N.BELLY] = mkNode(cx, cy - s * 0.4)
		nodes[N.HIPS] = mkNode(cx, cy + s * 0.5)
		nodes[N.LS] = mkNode(cx - s * 0.85, cy - s * 1.9)
		nodes[N.RS] = mkNode(cx + s * 0.85, cy - s * 1.9)
		nodes[N.LE] = mkNode(cx - s * 1.6, cy - s * 0.6)
		nodes[N.RE] = mkNode(cx + s * 1.6, cy - s * 0.6)
		nodes[N.LH] = mkNode(cx - s * 2.1, cy + s * 0.7)
		nodes[N.RH] = mkNode(cx + s * 2.1, cy + s * 0.7)
		nodes[N.LHip] = mkNode(cx - s * 0.45, cy + s * 0.5)
		nodes[N.RHip] = mkNode(cx + s * 0.45, cy + s * 0.5)
		nodes[N.LK] = mkNode(cx - s * 0.55, cy + s * 1.8)
		nodes[N.RK] = mkNode(cx + s * 0.55, cy + s * 1.8)
		nodes[N.LF] = mkNode(cx - s * 0.6, cy + s * 3.1)
		nodes[N.RF] = mkNode(cx + s * 0.6, cy + s * 3.1)

		function lnk(a, b, st) {
			constraints.push({ a, b, len: distN(a, b), st: st || 1 })
		}
		lnk(N.HEAD, N.NECK)
		lnk(N.NECK, N.CHEST)
		lnk(N.CHEST, N.BELLY, 0.9)
		lnk(N.BELLY, N.HIPS, 0.9)
		lnk(N.NECK, N.LS, 0.9)
		lnk(N.NECK, N.RS, 0.9)
		lnk(N.CHEST, N.LS, 0.8)
		lnk(N.CHEST, N.RS, 0.8)
		lnk(N.LS, N.LE, 0.85)
		lnk(N.RS, N.RE, 0.85)
		lnk(N.LE, N.LH, 0.85)
		lnk(N.RE, N.RH, 0.85)
		lnk(N.HIPS, N.LHip, 0.9)
		lnk(N.HIPS, N.RHip, 0.9)
		lnk(N.LHip, N.LK, 0.85)
		lnk(N.RHip, N.RK, 0.85)
		lnk(N.LK, N.LF, 0.85)
		lnk(N.RK, N.RF, 0.85)
		lnk(N.CHEST, N.HIPS, 0.45)
		lnk(N.LS, N.RS, 0.8)
		lnk(N.LHip, N.RHip, 0.8)
	}

	function physicsStep() {
		const fy = roomH * FLOOR_RATIO,
			wl = 4,
			wr = roomW - 4
		for (let i = 0; i < nodes.length; i++) {
			const n = nodes[i]
			const vx = (n.x - n.px) * DAMPING,
				vy = (n.y - n.py) * DAMPING
			n.px = n.x
			n.py = n.y
			n.x += vx
			n.y += vy + GRAVITY
			if (n.y > fy) {
				const impVy = n.y - n.py
				n.y = fy
				n.py = impVy > 0.8 ? n.y + impVy * FLOOR_BOUNCE : n.y
				n.px = n.x - vx * FLOOR_FRIC
			}
			if (n.y < 4) {
				n.y = 4
				n.py = n.y - (n.py - n.y) * 0.35
			}
			if (n.x < wl) {
				n.x = wl
				n.px = n.x + (n.x - n.px) * 0.5
			}
			if (n.x > wr) {
				n.x = wr
				n.px = n.x + (n.x - n.px) * 0.5
			}
		}
		for (let it = 0; it < ITER; it++) {
			for (let i = 0; i < constraints.length; i++) {
				const c = constraints[i],
					a = nodes[c.a],
					b = nodes[c.b]
				const dx = b.x - a.x,
					dy = b.y - a.y,
					d = Math.sqrt(dx * dx + dy * dy) || 0.001
				const diff = ((d - c.len) / d) * 0.5 * c.st
				a.x += dx * diff
				a.y += dy * diff
				b.x -= dx * diff
				b.y -= dy * diff
			}
		}
	}

	function applyHit(mx, my, force) {
		const hitR = roomH * 0.27
		let hit = false
		for (let i = 0; i < nodes.length; i++) {
			const dx = nodes[i].x - mx,
				dy = nodes[i].y - my
			if (dx * dx + dy * dy < hitR * hitR) {
				hit = true
				break
			}
		}
		if (!hit) return false

		for (let i = 0; i < nodes.length; i++) {
			const n = nodes[i],
				dx = n.x - mx,
				dy = n.y - my,
				d = Math.sqrt(dx * dx + dy * dy)
			if (d < hitR && d > 0.1) {
				const falloff = 1 - d / hitR,
					f = falloff * force * POWER
				const nx = dx / d,
					ny = dy / d
				const upForce = falloff * force * UP_MULT
				n.px = n.x - nx * f * 9
				n.py = n.y - Math.abs(ny) * f * 6 - upForce * 10
			}
		}

		screenShake = Math.min(screenShake + force * 18, 28)

		const cols = ['#ff2244', '#cc0011', '#ff6600', '#fff', '#ff44aa', '#ffaa00']
		const cnt = Math.min(20, Math.floor(8 + force * 14))
		for (let i = 0; i < cnt; i++) {
			const a = Math.random() * Math.PI * 2,
				sp = 3 + Math.random() * 9 * force
			hitParticles.push({
				x: mx,
				y: my,
				vx: Math.cos(a) * sp,
				vy: Math.sin(a) * sp - 3.5,
				life: 1,
				decay: 0.04 + Math.random() * 0.04,
				size: 3 + Math.random() * 8,
				col: cols[Math.floor(Math.random() * cols.length)],
			})
		}
		if (hitParticles.length > 80)
			hitParticles.splice(0, hitParticles.length - 80)

		const txts = [
			'БАМ!',
			'ХРЯСЬ!',
			'ОЙ!',
			'АЙ!',
			'ПОЛУЧИ!',
			'💀',
			'⭐',
			'💥',
			'ПИЗДЕЦ!',
			'УЛЕТЕЛ!',
			'🚀',
			'ВЖУХ!',
		]
		floatingTexts.push({
			x: mx + (Math.random() - 0.5) * 70,
			y: my - 20,
			text: txts[Math.floor(Math.random() * txts.length)],
			life: 1,
			vy: -4,
			size: 24 + Math.random() * 16,
		})
		if (floatingTexts.length > 8) floatingTexts.shift()
		return true
	}

	function drawRoom() {
		const ctx = kickCtx,
			W = roomW,
			H = roomH,
			fy = H * FLOOR_RATIO
		const wg = ctx.createLinearGradient(0, 0, 0, fy)
		wg.addColorStop(0, '#1a0f0a')
		wg.addColorStop(0.5, '#2a1810')
		wg.addColorStop(1, '#1f1208')
		ctx.fillStyle = wg
		ctx.fillRect(0, 0, W, fy)
		ctx.strokeStyle = 'rgba(0,0,0,.2)'
		ctx.lineWidth = 1
		for (let r = 0; r * 34 < fy; r++) {
			const o = (r % 2) * 35
			for (let c = -1; c * 70 < W + 70; c++)
				ctx.strokeRect(c * 70 + o, r * 34, 70, 34)
		}
		ctx.fillStyle = 'rgba(120,0,0,.22)'
		;[
			[W * 0.18, H * 0.25, 14],
			[W * 0.72, H * 0.38, 9],
			[W * 0.5, H * 0.15, 17],
		].forEach(([x, y, r]) => {
			ctx.beginPath()
			ctx.arc(x, y, r, 0, Math.PI * 2)
			ctx.fill()
		})
		const fg = ctx.createLinearGradient(0, fy, 0, H)
		fg.addColorStop(0, '#2d2218')
		fg.addColorStop(1, '#1a1008')
		ctx.fillStyle = fg
		ctx.fillRect(0, fy, W, H - fy)
		ctx.fillStyle = '#3d2e1e'
		ctx.fillRect(0, fy - 6, W, 6)
		ctx.strokeStyle = 'rgba(0,0,0,.13)'
		ctx.lineWidth = 1
		for (let x = 0; x < W; x += 110) {
			ctx.beginPath()
			ctx.moveTo(x, fy)
			ctx.lineTo(x, H)
			ctx.stroke()
		}
		const lx = W / 2
		ctx.strokeStyle = '#666'
		ctx.lineWidth = 2
		ctx.beginPath()
		ctx.moveTo(lx, 0)
		ctx.lineTo(lx, 24)
		ctx.stroke()
		ctx.fillStyle = '#ffdd66'
		ctx.beginPath()
		ctx.arc(lx, 30, 10, 0, Math.PI * 2)
		ctx.fill()
		const lg = ctx.createRadialGradient(lx, 30, 5, lx, 30, H * 0.65)
		lg.addColorStop(0, 'rgba(255,230,150,.08)')
		lg.addColorStop(1, 'rgba(0,0,0,0)')
		ctx.fillStyle = lg
		ctx.fillRect(0, 0, W, H)
	}

	function drawRagdoll() {
		if (!nodes.length) return
		const ctx = kickCtx,
			s = roomH * 0.065,
			headR = s * 1.08
		ctx.lineCap = 'round'
		function limb(a, b, w, c) {
			ctx.strokeStyle = c
			ctx.lineWidth = w
			ctx.beginPath()
			ctx.moveTo(nodes[a].x, nodes[a].y)
			ctx.lineTo(nodes[b].x, nodes[b].y)
			ctx.stroke()
		}
		ctx.strokeStyle = '#e8c49a'
		ctx.lineWidth = s * 1.4
		ctx.beginPath()
		ctx.moveTo(nodes[N.NECK].x, nodes[N.NECK].y)
		ctx.lineTo(nodes[N.CHEST].x, nodes[N.CHEST].y)
		ctx.lineTo(nodes[N.BELLY].x, nodes[N.BELLY].y)
		ctx.lineTo(nodes[N.HIPS].x, nodes[N.HIPS].y)
		ctx.stroke()
		limb(N.LS, N.RS, s * 1.2, '#e8c49a')
		limb(N.LS, N.LE, s * 0.8, '#d4a87a')
		limb(N.LE, N.LH, s * 0.7, '#d4a87a')
		limb(N.RS, N.RE, s * 0.8, '#d4a87a')
		limb(N.RE, N.RH, s * 0.7, '#d4a87a')
		limb(N.LHip, N.RHip, s * 1.1, '#5a6e8a')
		limb(N.LHip, N.LK, s * 0.9, '#5a6e8a')
		limb(N.LK, N.LF, s * 0.8, '#6a5040')
		limb(N.RHip, N.RK, s * 0.9, '#5a6e8a')
		limb(N.RK, N.RF, s * 0.8, '#6a5040')
		;[N.LF, N.RF].forEach(i => {
			ctx.fillStyle = '#3a2010'
			ctx.beginPath()
			ctx.ellipse(nodes[i].x, nodes[i].y, s * 0.6, s * 0.28, 0, 0, Math.PI * 2)
			ctx.fill()
		})
		;[N.LH, N.RH].forEach(i => {
			ctx.fillStyle = '#d4a87a'
			ctx.beginPath()
			ctx.arc(nodes[i].x, nodes[i].y, s * 0.38, 0, Math.PI * 2)
			ctx.fill()
		})
		ctx.strokeStyle = '#e8c49a'
		ctx.lineWidth = s * 0.6
		ctx.beginPath()
		ctx.moveTo(nodes[N.NECK].x, nodes[N.NECK].y)
		ctx.lineTo(nodes[N.HEAD].x, nodes[N.HEAD].y)
		ctx.stroke()
		const hd = nodes[N.HEAD],
			nk = nodes[N.NECK]
		ctx.save()
		ctx.translate(hd.x, hd.y)
		ctx.rotate(Math.atan2(hd.y - nk.y, hd.x - nk.x) + Math.PI / 2)
		ctx.fillStyle = '#e8c49a'
		ctx.beginPath()
		ctx.arc(0, 0, headR, 0, Math.PI * 2)
		ctx.fill()
		if (dimaFaceImg && dimaFaceImg.complete && dimaFaceImg.naturalWidth > 0) {
			ctx.save()
			ctx.beginPath()
			ctx.arc(0, 0, headR - 1, 0, Math.PI * 2)
			ctx.clip()
			ctx.drawImage(dimaFaceImg, -headR, -headR, headR * 2, headR * 2)
			ctx.restore()
		} else {
			ctx.fillStyle = '#d4a070'
			ctx.beginPath()
			ctx.arc(0, 0, headR - 1, 0, Math.PI * 2)
			ctx.fill()
		}
		ctx.restore()
	}

	// FIX #4: Slower, more visible weapon animation
	function drawWeapon() {
		const ctx = kickCtx,
			dx = mouse.x - mouse.px,
			dy = mouse.y - mouse.py,
			sp = Math.sqrt(dx * dx + dy * dy)
		if (sp > 1)
			weaponAngle += (Math.atan2(dy, dx) + Math.PI * 0.3 - weaponAngle) * 0.18
		ctx.save()
		ctx.translate(mouse.x, mouse.y)
		ctx.rotate(weaponAngle + (isSwinging ? -0.85 : 0))
		if (selectedWeapon === 'bat') {
			const L = roomH * 0.22 // FIX #4: bigger bat
			ctx.fillStyle = '#5a3010'
			ctx.beginPath()
			ctx.roundRect(-6, 0, 12, L * 0.42, 4)
			ctx.fill()
			ctx.strokeStyle = '#8B4513'
			ctx.lineWidth = 2.5
			for (let i = 0; i < 5; i++) {
				ctx.beginPath()
				ctx.moveTo(-7, L * 0.07 + i * 7)
				ctx.lineTo(7, L * 0.07 + i * 7)
				ctx.stroke()
			}
			const bg = ctx.createLinearGradient(-14, L * 0.42, 14, L * 0.42)
			bg.addColorStop(0, '#7B3510')
			bg.addColorStop(0.4, '#CD853F')
			bg.addColorStop(1, '#5B2408')
			ctx.fillStyle = bg
			ctx.beginPath()
			ctx.moveTo(-6, L * 0.42)
			ctx.lineTo(-14, L * 0.82)
			ctx.quadraticCurveTo(-16, L, 0, L)
			ctx.quadraticCurveTo(16, L, 14, L * 0.82)
			ctx.lineTo(6, L * 0.42)
			ctx.closePath()
			ctx.fill()
		} else {
			const L = roomH * 0.2 // FIX #4: bigger weapon
			const dg = ctx.createLinearGradient(-10, 0, 10, 0)
			dg.addColorStop(0, '#e8a090')
			dg.addColorStop(0.5, '#f4c4b0')
			dg.addColorStop(1, '#d08070')
			ctx.fillStyle = dg
			ctx.beginPath()
			ctx.roundRect(-9, 0, 18, L * 0.72, 8)
			ctx.fill()
			ctx.fillStyle = '#e07060'
			ctx.beginPath()
			ctx.arc(0, L * 0.72, 11, 0, Math.PI * 2)
			ctx.fill()
			ctx.fillStyle = '#c06050'
			ctx.beginPath()
			ctx.ellipse(0, L * 0.05, 14, 10, 0, 0, Math.PI * 2)
			ctx.fill()
		}
		ctx.restore()
	}

	function loop(ts) {
		if (!kickCanvas || !kickCanvas.isConnected) {
			animFrame = null
			return
		}
		if (document.hidden) {
			animFrame = requestAnimationFrame(loop)
			return
		}
		// FIX #4: Uncap frame rate slightly for smoother weapon display
		if (ts - lastTime < 10) {
			animFrame = requestAnimationFrame(loop)
			return
		}
		lastTime = ts
		const cw = kickCanvas.clientWidth,
			ch = kickCanvas.clientHeight
		if (kickCanvas.width !== cw || kickCanvas.height !== ch) {
			kickCanvas.width = cw
			kickCanvas.height = ch
			roomW = cw
			roomH = ch
		}
		kickCtx.clearRect(0, 0, roomW, roomH)
		kickCtx.save()
		if (screenShake > 0.3) {
			kickCtx.translate(
				(Math.random() - 0.5) * screenShake,
				(Math.random() - 0.5) * screenShake,
			)
			screenShake *= 0.72
		} else screenShake = 0
		drawRoom()
		physicsStep()
		drawRagdoll()
		drawWeapon()
		if (hitParticles.length) {
			const fy = roomH * FLOOR_RATIO
			kickCtx.save()
			for (let i = hitParticles.length - 1; i >= 0; i--) {
				const p = hitParticles[i]
				p.x += p.vx
				p.y += p.vy
				p.vy += 0.3
				if (p.y > fy) {
					p.y = fy
					p.vy *= -0.38
					p.vx *= 0.68
				}
				p.life -= p.decay
				p.size *= 0.96
				if (p.life <= 0) {
					hitParticles.splice(i, 1)
					continue
				}
				kickCtx.globalAlpha = p.life
				kickCtx.fillStyle = p.col
				kickCtx.beginPath()
				kickCtx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2)
				kickCtx.fill()
			}
			kickCtx.restore()
		}
		if (floatingTexts.length) {
			kickCtx.save()
			for (let i = floatingTexts.length - 1; i >= 0; i--) {
				const t = floatingTexts[i]
				t.y += t.vy
				t.vy *= 0.91
				t.life -= 0.019
				if (t.life <= 0) {
					floatingTexts.splice(i, 1)
					continue
				}
				kickCtx.globalAlpha = t.life
				kickCtx.font = `bold ${t.size}px Impact,sans-serif`
				kickCtx.textAlign = 'center'
				kickCtx.strokeStyle = '#993300'
				kickCtx.lineWidth = 4
				kickCtx.strokeText(t.text, t.x, t.y)
				kickCtx.fillStyle = '#ffdd00'
				kickCtx.fillText(t.text, t.x, t.y)
			}
			kickCtx.restore()
		}
		kickCtx.restore()
		if (isSwinging) {
			swingTimer++
			if (swingTimer > 7) {
				isSwinging = false
				swingTimer = 0
			}
		}
		if (swingCooldown > 0) swingCooldown--
		animFrame = requestAnimationFrame(loop)
	}

	function tryHit() {
		if (swingCooldown > 0) return
		const hit = applyHit(
			mouse.x,
			mouse.y,
			selectedWeapon === 'bat' ? 1.0 : 0.85,
		)
		if (hit) {
			isSwinging = true
			swingTimer = 0
		}
		swingCooldown = 9
	}

	function getSidebarWidth() {
		const sb = document.querySelector('.sidebar-nav')
		if (sb) {
			const r = sb.getBoundingClientRect()
			if (r.width > 0 && r.left <= 10) return r.right
		}
		const all = document.querySelectorAll('*')
		for (let i = 0; i < all.length; i++) {
			const s = window.getComputedStyle(all[i])
			if (
				(s.position === 'fixed' || s.position === 'sticky') &&
				s.display !== 'none'
			) {
				const r = all[i].getBoundingClientRect()
				if (r.left <= 5 && r.width > 40 && r.width < 250 && r.height > 150)
					return r.right
			}
		}
		return 0
	}

	function applyKickLayout() {
		const el = document.getElementById('kick')
		if (!el) return
		if (window.innerWidth <= 768) {
			el.style.left = '0px'
			el.style.width = '100%'
			el.style.bottom = '70px'
		} else {
			const sw = getSidebarWidth()
			el.style.left = sw + 'px'
			el.style.width = window.innerWidth - sw + 'px'
			el.style.bottom = '0px'
		}
	}

	function startGame() {
		kickCanvas = document.getElementById('kickCanvas')
		if (!kickCanvas) return
		applyKickLayout()
		window.addEventListener('resize', applyKickLayout)
		kickCtx = kickCanvas.getContext('2d', { alpha: false })
		roomW = kickCanvas.clientWidth || 800
		roomH = kickCanvas.clientHeight || 500
		kickCanvas.width = roomW
		kickCanvas.height = roomH
		if (!dimaFaceImg) {
			dimaFaceImg = new Image()
			dimaFaceImg.src = 'img/photo (2).jpg'
		}
		buildRagdoll()
		kickCanvas.onmousemove = e => {
			const r = kickCanvas.getBoundingClientRect()
			mouse.px = mouse.x
			mouse.py = mouse.y
			mouse.x = e.clientX - r.left
			mouse.y = e.clientY - r.top
			if (mouse.down) tryHit()
		}
		kickCanvas.onmousedown = e => {
			e.preventDefault()
			mouse.down = true
			const r = kickCanvas.getBoundingClientRect()
			mouse.x = e.clientX - r.left
			mouse.y = e.clientY - r.top
			tryHit()
		}
		kickCanvas.onmouseup = () => {
			mouse.down = false
		}
		kickCanvas.onmouseleave = () => {
			mouse.down = false
		}
		kickCanvas.ontouchstart = e => {
			e.preventDefault()
			const r = kickCanvas.getBoundingClientRect(),
				t = e.touches[0]
			mouse.x = t.clientX - r.left
			mouse.y = t.clientY - r.top
			mouse.down = true
			tryHit()
		}
		kickCanvas.ontouchmove = e => {
			e.preventDefault()
			const r = kickCanvas.getBoundingClientRect(),
				t = e.touches[0]
			mouse.px = mouse.x
			mouse.py = mouse.y
			mouse.x = t.clientX - r.left
			mouse.y = t.clientY - r.top
			tryHit()
		}
		kickCanvas.ontouchend = () => {
			mouse.down = false
		}
		if (animFrame) cancelAnimationFrame(animFrame)
		lastTime = 0
		animFrame = requestAnimationFrame(loop)
	}

	window.selectKickWeapon = function (w) {
		selectedWeapon = w
		document
			.querySelectorAll('.kick-weapon-btn')
			.forEach(b => b.classList.toggle('active', b.dataset.weapon === w))
	}
	window.resetRagdoll = function () {
		hitParticles = []
		floatingTexts = []
		screenShake = 0
		buildRagdoll()
	}
	window.initKickGame = function () {
		const el = document.getElementById('kick')
		if (el) {
			el.classList.add('kick-active')
			applyKickLayout()
		}
		setTimeout(startGame, 80)
	}
	window.stopKickGame = function () {
		const el = document.getElementById('kick')
		if (el) el.classList.remove('kick-active')
		if (animFrame) {
			cancelAnimationFrame(animFrame)
			animFrame = null
		}
		window.removeEventListener('resize', applyKickLayout)
	}
	window.toggleKickShop = function () {
		const o = document.getElementById('kickShopOverlay')
		if (o) o.classList.toggle('open')
	}
	window.closeKickShop = function (e) {
		if (e.target === document.getElementById('kickShopOverlay'))
			document.getElementById('kickShopOverlay').classList.remove('open')
	}
	window.closeKickShopForce = function () {
		const o = document.getElementById('kickShopOverlay')
		if (o) o.classList.remove('open')
	}

	const _origSwitch = window.switchTab
	window.switchTab = function (tab, clickedBtn) {
		if (tab === 'kick') {
			document
				.querySelectorAll('.tab-content')
				.forEach(t => t.classList.remove('active'))
			document
				.querySelectorAll('nav .tab-btn, .sidebar-nav .tab-btn')
				.forEach(b => b.classList.remove('active'))
			if (clickedBtn) clickedBtn.classList.add('active')
			window.initKickGame()
		} else {
			window.stopKickGame()
			if (_origSwitch) _origSwitch(tab, clickedBtn)
			if (tab === 'admin') window.loadAdminPanel()
		}
	}
})()

// ========================================
// ADMIN PANEL
// ========================================
function checkAdminAccess() {
	if (!window.currentUser || window.currentUser.email !== window.ADMIN_EMAIL)
		return

	let attempts = 0
	const tryShow = () => {
		const btn = document.getElementById('adminNavBtn')
		if (btn) {
			btn.removeAttribute('style')
			btn.classList.add('admin-visible')
			console.log('✅ Админ кнопка показана')
		} else if (attempts < 10) {
			attempts++
			setTimeout(tryShow, 200)
		}
	}
	setTimeout(tryShow, 100)
}

window.loadAdminPanel = async function () {
	if (!window.currentUser || window.currentUser.email !== window.ADMIN_EMAIL) {
		alert('Нет доступа!')
		return
	}

	const list = document.getElementById('adminUsersList')
	const totalEl = document.getElementById('adminTotalUsers')

	if (!list || !totalEl) {
		setTimeout(() => window.loadAdminPanel(), 300)
		return
	}

	list.innerHTML = '<div style="color:#aaa;padding:20px;">Загрузка...</div>'

	// Используем .then() вместо async/await — точно как рабочий код из консоли
	database
		.ref('users')
		.once('value')
		.then(snap => {
			totalEl.textContent = snap.numChildren()
			list.innerHTML = ''

			if (!snap.exists()) {
				list.innerHTML =
					'<div style="color:#aaa;padding:20px;">Пользователей нет</div>'
				return
			}

			snap.forEach(c => {
				const user = { uid: c.key, ...c.val() }
				const row = document.createElement('div')
				row.className = 'admin-table-row'
				const safeName = (user.displayName || 'Пользователь').replace(
					/'/g,
					"\\'",
				)
				row.innerHTML = `
				<span class="admin-user-name">${user.displayName || user.email || 'Без имени'}</span>
				<span class="admin-user-email">${user.email || '—'}</span>
				<span class="admin-user-balance" id="bal_${user.uid}">${(user.balance || 0).toFixed(1)}</span>
				<span class="admin-actions">
					<button class="admin-btn admin-btn-add" onclick="adminChangeBalance('${user.uid}', '${safeName}', 'add')">➕</button>
					<button class="admin-btn admin-btn-sub" onclick="adminChangeBalance('${user.uid}', '${safeName}', 'sub')">➖</button>
					<button class="admin-btn admin-btn-set" onclick="adminChangeBalance('${user.uid}', '${safeName}', 'set')">✏️</button>
				</span>
			`
				list.appendChild(row)
			})
		})
		.catch(e => {
			list.innerHTML = `<div style="color:#ff4444;padding:20px;">Ошибка: ${e.message}</div>`
		})
}

window.adminChangeBalance = async function (uid, name, action) {
	if (!window.currentUser || window.currentUser.email !== window.ADMIN_EMAIL)
		return

	const labels = { add: 'Добавить', sub: 'Снять', set: 'Установить' }
	const amount = parseFloat(prompt(`${labels[action]} баланс для ${name}:`))
	if (isNaN(amount) || amount < 0) {
		alert('Некорректная сумма')
		return
	}

	try {
		const snap = await database.ref(`users/${uid}`).once('value')
		const cur = snap.val()?.balance || 0
		let newBal
		if (action === 'add') newBal = cur + amount
		else if (action === 'sub') newBal = Math.max(0, cur - amount)
		else newBal = amount

		await database.ref(`users/${uid}`).update({ balance: newBal })

		const balEl = document.getElementById(`bal_${uid}`)
		if (balEl) balEl.textContent = newBal.toFixed(1)
		alert(`✅ Баланс ${name}: ${cur.toFixed(1)} → ${newBal.toFixed(1)}`)
	} catch (e) {
		alert('Ошибка: ' + e.message)
	}
}

// ========================================
// РЭП-СОБАКИ КАЗИНО — ДОБАВИТЬ В script.js
// ========================================

// Символы для поля 6x5
const RAP_SYMBOLS = [
	{ id: 'cock', emoji: '🐓', name: 'Петух', weight: 5 },
	{ id: 'dog', emoji: '🐕', name: 'Собака', weight: 18 },
	{ id: 'mic', emoji: '🎤', name: 'Микрофон', weight: 15 },
	{ id: 'chain', emoji: '⛓️', name: 'Цепь', weight: 14 },
	{ id: 'money', emoji: '💸', name: 'Деньги', weight: 16 },
	{ id: 'fire', emoji: '🔥', name: 'Огонь', weight: 15 },
	{ id: 'poop', emoji: '💩', name: 'Пуп', weight: 12 },
	{ id: 'crown', emoji: '👑', name: 'Корона', weight: 10 },
	{ id: 'star', emoji: '⭐', name: 'Звезда', weight: 20 },
]

// Рэп-тексты про петуха Балыки (зачитывают собаки)
const RAP_LYRICS = [
	[
		'Эй, Дима-петух, ты с завода идёшь,',
		'За 10 монет <em>балык</em> себе жуёшь!',
		'Шарики-пельмени, конвейер гудит —',
		'Петух на фарме, <em>кошелёк горит</em>!',
	],
	[
		'Балыка завод, выдаёт продукт,',
		'Дима крутит ставку — <em>слышишь этот звук?</em>',
		'Проиграл опять, ничего нет тут —',
		'Собаки рэпят, пока <em>деньги уйдут!</em>',
	],
	[
		'Бум-бум-бум, петух летит вперёд,',
		'Казино открылось — <em>Балыка не ждёт!</em>',
		'Пельмень в кармане, бутерброд в руке,',
		'Дима проиграл всё <em>на своей мечте!</em>',
	],
	[
		'Мы — рэп-собаки, прилетели к вам,',
		'Петух Балыка платит <em>по счетам!</em>',
		'Конвейер крутится, балык прессуют тут —',
		'Собаки рэпуют, пока <em>монеты жгут!</em>',
	],
	[
		'Йо, слушай петух, твой завод гудит,',
		'Три петуха в ряд — <em>жопа горит!</em>',
		'ДЖЕКПОТ потерял, монет уже ноль —',
		'Балыка на поле, <em>главная роль!</em>',
	],
	[
		'Прилетели псы, микрофон в зубах,',
		'Дима на рулетке, <em>паника в глазах!</em>',
		'Шесть на пять поле, тридцать ячеек —',
		'<em>Петух проиграл</em> — это не ошибка!',
	],
	[
		'Рэп-собаки воют на луну ночью,',
		'Балыка с бэйджом, <em>работает срочно!</em>',
		'Завод выдаёт нам пельмени, друг —',
		'Но в казино всё уходит <em>по кругу!</em>',
	],
]

// Породы собак-рэперов с именами
const RAP_DOG_RAPPERS = [
	{ emoji: '🐕', name: 'DMX-пёс', color: '#FF6B35' },
	{ emoji: '🐩', name: 'Snoop Dogge', color: '#a78bfa' },
	{ emoji: '🦮', name: 'Jay-Z Гав', color: '#FFD700' },
	{ emoji: '🐶', name: 'Пафос-Корги', color: '#2ecc71' },
	{ emoji: '🦴', name: 'Biggie Кость', color: '#ef5350' },
	{ emoji: '🐾', name: 'Эминем-Лапки', color: '#1d9bf0' },
]

// Выигрышные комбинации
const RAP_PAYOUTS = {
	cock: { 3: 8, 4: 20, 5: 50, 6: 120, jackpot: true },
	dog: { 3: 3, 4: 8, 5: 18, 6: 40 },
	mic: { 3: 2, 4: 6, 5: 12, 6: 28 },
	chain: { 3: 2, 4: 5, 5: 10, 6: 22 },
	crown: { 3: 4, 4: 10, 5: 22, 6: 55 },
	money: { 3: 1.5, 4: 4, 5: 8, 6: 18 },
	fire: { 3: 1, 4: 3, 5: 6, 6: 14 },
	poop: { 3: 1, 4: 2, 5: 4, 6: 9 },
	star: { 3: 1, 4: 2, 5: 4, 6: 9 },
}

let rapBet = 5
let rapSpinning = false
let rapStats = { spins: 0, wins: 0, biggestWin: 0 }
let rapBgAnimId = null
let rapBgParticles = []

// Инициализация поля
function initRapField() {
	const grid = document.getElementById('rapGrid')
	if (!grid) return
	grid.innerHTML = ''
	for (let row = 0; row < 5; row++) {
		for (let col = 0; col < 6; col++) {
			const cell = document.createElement('div')
			cell.className = 'rap-cell'
			cell.dataset.row = row
			cell.dataset.col = col
			const sym = getWeightedRapSymbol()
			cell.innerHTML = `<span class="rap-cell-symbol">${sym.emoji}</span>`
			cell.dataset.symbol = sym.id
			grid.appendChild(cell)
		}
	}
	buildRapPaytable()
	updateRapBalance()
	loadRapStats()
	startRapBgAnim()
}

function getWeightedRapSymbol() {
	const total = RAP_SYMBOLS.reduce((a, s) => a + s.weight, 0)
	let r = Math.random() * total
	for (const s of RAP_SYMBOLS) {
		r -= s.weight
		if (r <= 0) return s
	}
	return RAP_SYMBOLS[0]
}

function buildRapPaytable() {
	const list = document.getElementById('rapPaylineList')
	if (!list) return
	list.innerHTML = ''
	const toShow = [
		{ sym: RAP_SYMBOLS.find(s => s.id === 'cock'), count: 3, jackpot: true },
		{ sym: RAP_SYMBOLS.find(s => s.id === 'dog'), count: 3 },
		{ sym: RAP_SYMBOLS.find(s => s.id === 'crown'), count: 3 },
		{ sym: RAP_SYMBOLS.find(s => s.id === 'mic'), count: 3 },
		{ sym: RAP_SYMBOLS.find(s => s.id === 'chain'), count: 3 },
		{ sym: RAP_SYMBOLS.find(s => s.id === 'money'), count: 3 },
		{ sym: RAP_SYMBOLS.find(s => s.id === 'poop'), count: 3 },
	]
	toShow.forEach(({ sym, count, jackpot }) => {
		const mult = RAP_PAYOUTS[sym.id][count]
		const div = document.createElement('div')
		div.className = 'rap-pay-item' + (jackpot ? ' jackpot' : '')
		div.dataset.symId = sym.id
		div.innerHTML = `${sym.emoji.repeat(count)} <span class="rap-pay-mult">${jackpot ? '🏆' : ''}x${mult}</span>`
		list.appendChild(div)
	})
}

window.setRapBet = function (amount, btn) {
	rapBet = amount
	document
		.querySelectorAll('.rap-bet-btn')
		.forEach(b => b.classList.remove('active'))
	if (btn) btn.classList.add('active')
	const costEl = document.getElementById('rapSpinCost')
	if (costEl) costEl.textContent = '-' + amount
}

function updateRapBalance() {
	const el = document.getElementById('rapBalance')
	if (el) el.textContent = userCurrency.toFixed(1)
}

// ГЛАВНАЯ ФУНКЦИЯ СПИНА
window.spinRapDogs = async function () {
	if (rapSpinning) return
	if (userCurrency < rapBet) {
		showRapMessage('broke', 'Недостаточно монет, петух!')
		return
	}

	rapSpinning = true
	if (window.SND) window.SND.casinoSpin()
	const btn = document.getElementById('rapSpinBtn')
	const multDisplay = document.getElementById('rapMultDisplay')
	if (btn) btn.disabled = true
	if (multDisplay) multDisplay.style.opacity = '0'

	addCurrency(-rapBet)
	updateRapBalance()
	clearRapWinEffects()
	clearRapDogs()

	const cells = document.querySelectorAll('.rap-cell')

	// Фаза 1: все клетки вращаются
	cells.forEach(cell => cell.classList.add('spinning'))

	// Фаза 2: поочерёдно останавливаем по столбцам
	const cols = 6
	const rows = 5
	const finalSymbols = []

	for (let i = 0; i < rows * cols; i++) {
		finalSymbols.push(getWeightedRapSymbol())
	}

	// Случайные промежуточные символы во время вращения
	let tickInterval = setInterval(() => {
		cells.forEach(cell => {
			if (cell.classList.contains('spinning')) {
				const s = getWeightedRapSymbol()
				cell.querySelector('.rap-cell-symbol').textContent = s.emoji
				cell.dataset.symbol = s.id
			}
		})
	}, 80)

	// Останавливаем по столбцам с задержкой
	for (let col = 0; col < cols; col++) {
		await sleep(160 + col * 100)
		for (let row = 0; row < rows; row++) {
			const idx = row * cols + col
			const cell = cells[idx]
			const sym = finalSymbols[idx]
			cell.classList.remove('spinning')
			cell.querySelector('.rap-cell-symbol').textContent = sym.emoji
			cell.dataset.symbol = sym.id

			// Небольшая анимация приземления
			cell.style.transform = 'scale(1.1)'
			setTimeout(() => {
				cell.style.transform = ''
			}, 120)
		}
	}

	clearInterval(tickInterval)

	// Анализируем выигрыши
	await sleep(200)
	const results = analyzeRapWins(cells, finalSymbols)

	rapStats.spins++

	if (results.totalMultiplier > 0) {
		const winAmount = Math.floor(rapBet * results.totalMultiplier)
		if (window.SND) {
			if (results.isJackpot || winAmount >= rapBet * 20)
				window.SND.casinoBigWin()
			else window.SND.casinoWin()
		}
		addCurrency(winAmount)
		updateRapBalance()
		rapStats.wins++
		if (winAmount > rapStats.biggestWin) rapStats.biggestWin = winAmount

		// Подсвечиваем выигрышные клетки
		results.winCells.forEach(idx => {
			const isJackpot = results.isJackpot
			cells[idx].classList.add(isJackpot ? 'big-winner' : 'winner')
		})

		// Подсвечиваем выигрышные строки в таблице выплат
		results.hitSymbols.forEach(symId => {
			const payItem = document.querySelector(
				`.rap-pay-item[data-sym-id="${symId}"]`,
			)
			if (payItem) {
				payItem.classList.add('hit')
				setTimeout(() => payItem.classList.remove('hit'), 2000)
			}
		})

		// Показываем мультипликатор
		if (multDisplay) {
			multDisplay.style.opacity = '1'
			document.getElementById('rapMultText').textContent =
				'x' + results.totalMultiplier.toFixed(1)
		}

		// Показываем текст победы на поле
		showRapWinOverlay(results.totalMultiplier, results.isJackpot)

		// Запускаем собак-рэперов!
		const dogCount = results.isJackpot
			? 6
			: Math.min(4, Math.ceil(results.totalMultiplier / 5) + 1)
		spawnRapDogs(dogCount, results.isJackpot)

		// Конфетти для больших выигрышей
		if (winAmount >= rapBet * 10) spawnRapConfetti(winAmount >= rapBet * 30)

		// Показываем рэп-лирику
		const lyricsIdx = Math.floor(Math.random() * RAP_LYRICS.length)
		showRapLyrics(RAP_LYRICS[lyricsIdx], results.isJackpot)

		document.getElementById('rapLastWin').textContent = winAmount
	} else {
		// Проигрыш — одна грустная собака
		await sleep(300)
		if (window.SND) window.SND.casinoLose()
		spawnRapDogs(1, false, true)
		showRapLoserMessage()
		document.getElementById('rapLastWin').textContent = '0'
	}

	saveRapStats()
	updateRapStats()

	await sleep(800)
	rapSpinning = false
	if (btn) btn.disabled = false
}

function analyzeRapWins(cells, symbols) {
	const rows = 5,
		cols = 6
	const winCells = new Set()
	const hitSymbols = []
	let totalMultiplier = 0
	let isJackpot = false

	// Проверяем горизонтальные линии (3+ в ряд)
	for (let row = 0; row < rows; row++) {
		for (let startCol = 0; startCol <= cols - 3; startCol++) {
			const baseSym = symbols[row * cols + startCol].id
			let count = 1
			for (let col = startCol + 1; col < cols; col++) {
				if (symbols[row * cols + col].id === baseSym) count++
				else break
			}
			if (count >= 3) {
				const payout = RAP_PAYOUTS[baseSym]
				const mult = payout ? payout[Math.min(count, 6)] || 0 : 0
				if (mult > 0) {
					totalMultiplier += mult
					hitSymbols.push(baseSym)
					if (RAP_PAYOUTS[baseSym].jackpot && count >= 5) isJackpot = true
					for (let c = startCol; c < startCol + count && c < cols; c++) {
						winCells.add(row * cols + c)
					}
				}
				break // одна линия на ряд
			}
		}
	}

	// Проверяем вертикальные линии (3+ вверх)
	for (let col = 0; col < cols; col++) {
		for (let startRow = 0; startRow <= rows - 3; startRow++) {
			const baseSym = symbols[startRow * cols + col].id
			let count = 1
			for (let row = startRow + 1; row < rows; row++) {
				if (symbols[row * cols + col].id === baseSym) count++
				else break
			}
			if (count >= 3) {
				const payout = RAP_PAYOUTS[baseSym]
				const mult = payout ? (payout[Math.min(count, 6)] || 0) * 0.6 : 0
				if (mult > 0) {
					totalMultiplier += mult
					hitSymbols.push(baseSym)
					for (let r = startRow; r < startRow + count && r < rows; r++) {
						winCells.add(r * cols + col)
					}
				}
				break
			}
		}
	}

	// Бонус: если весь экран заполнен одним символом (почти невозможно — ДЖЕКПОТ)
	const allSame = symbols.every(s => s.id === symbols[0].id)
	if (allSame) {
		totalMultiplier = 1000
		isJackpot = true
		symbols.forEach((_, i) => winCells.add(i))
	}

	// Урезаем мультипликатор
	totalMultiplier = totalMultiplier * 0.6
	// Дополнительный шанс полного провала даже при совпадениях
	if (Math.random() < 0.25) totalMultiplier = 0

	return {
		totalMultiplier: Math.round(totalMultiplier * 10) / 10,
		winCells: Array.from(winCells),
		hitSymbols: [...new Set(hitSymbols)],
		isJackpot,
	}
}

// Спавн летящих собак-рэперов
function spawnRapDogs(count, isJackpot, isLose) {
	const layer = document.getElementById('rapDogsLayer')
	if (!layer) return

	for (let i = 0; i < count; i++) {
		setTimeout(
			() => {
				const rapper =
					RAP_DOG_RAPPERS[Math.floor(Math.random() * RAP_DOG_RAPPERS.length)]
				const el = document.createElement('div')
				el.className = 'rap-flying-dog'

				const fromLeft = Math.random() < 0.5
				const yPos = 15 + Math.random() * 70
				const flyX = 40 + Math.random() * 50
				const flyY = -10 + Math.random() * 20
				const flyRot = (Math.random() - 0.5) * 30

				const rapLine = isLose
					? [
							'Ха-ха, петух!',
							'Снова ноль!',
							'Балыка плачет 😢',
							'В следующий раз!',
						][Math.floor(Math.random() * 4)]
					: isJackpot
						? '🏆 ДЖЕКПОТ ПЕТУХ! 🏆'
						: RAP_LYRICS[Math.floor(Math.random() * RAP_LYRICS.length)][
								Math.floor(Math.random() * 4)
							].replace(/<em>|<\/em>/g, '')

				el.innerHTML = `
                <span>${rapper.emoji}</span>
                <div class="rap-dog-speech" style="border-color:${rapper.color};color:${rapper.color};max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${rapLine.substring(0, 28)}</div>
            `
				el.style.cssText = `
                --fly-x: ${flyX}%;
                --fly-y: ${flyY}px;
                --fly-rot: ${flyRot}deg;
                top: ${yPos}%;
                ${fromLeft ? 'left: -120px' : 'right: -120px'};
                animation: ${fromLeft ? 'rapDogFly' : 'rapDogFlyRight'} ${1.8 + Math.random() * 1.4}s ease forwards;
                filter: drop-shadow(0 0 8px ${rapper.color}88);
            `
				layer.appendChild(el)

				const dur = parseFloat(el.style.animation.match(/[\d.]+s/)[0]) * 1000
				setTimeout(() => el.remove(), dur + 100)
			},
			i * 250 + (isJackpot ? 0 : 100),
		)
	}
}

function clearRapDogs() {
	const layer = document.getElementById('rapDogsLayer')
	if (layer) layer.innerHTML = ''
}

function showRapWinOverlay(mult, isJackpot) {
	const overlay = document.getElementById('rapWinOverlay')
	if (!overlay) return
	overlay.innerHTML = ''

	const txt = document.createElement('div')
	txt.className = 'rap-win-text-big'

	if (isJackpot) {
		txt.textContent = '🏆 ДЖЕКПОТ!'
		txt.style.color = '#FFD700'
	} else if (mult >= 50) {
		txt.textContent = '💥 MEGA WIN!'
		txt.style.color = '#FF3366'
	} else if (mult >= 20) {
		txt.textContent = '🔥 BIG WIN!'
		txt.style.color = '#FF6B35'
	} else {
		txt.textContent = '✅ WIN x' + mult
		txt.style.color = '#2ecc71'
	}

	overlay.appendChild(txt)
	overlay.classList.add('show')
	setTimeout(() => overlay.classList.remove('show'), 2500)
}

function clearRapWinEffects() {
	document.querySelectorAll('.rap-cell').forEach(c => {
		c.classList.remove('winner', 'big-winner')
	})
	const overlay = document.getElementById('rapWinOverlay')
	if (overlay) {
		overlay.classList.remove('show')
		overlay.innerHTML = ''
	}
}

function showRapLyrics(lines, isJackpot) {
	const box = document.getElementById('rapMessageBox')
	const dogEl = document.getElementById('rapDogRapper')
	const lyricsEl = document.getElementById('rapLyrics')
	if (!box || !dogEl || !lyricsEl) return

	const rapper =
		RAP_DOG_RAPPERS[Math.floor(Math.random() * RAP_DOG_RAPPERS.length)]
	dogEl.textContent = rapper.emoji
	lyricsEl.innerHTML = lines.map(l => `<div>${l}</div>`).join('')
	if (isJackpot) {
		lyricsEl.innerHTML =
			`<div><em>🏆 ДЖЕКПОТ ПЕТУХА! ВСЕ СОБАКИ ВОЮТ! 🏆</em></div>` +
			lyricsEl.innerHTML
	}
	box.style.display = 'flex'
	box.style.borderColor = rapper.color
	box.querySelector('.rap-lyrics').style.color = rapper.color
	setTimeout(() => {
		if (box) box.style.display = 'none'
	}, 5000)
}

function showRapLoserMessage() {
	const box = document.getElementById('rapMessageBox')
	const dogEl = document.getElementById('rapDogRapper')
	const lyricsEl = document.getElementById('rapLyrics')
	if (!box || !dogEl || !lyricsEl) return

	const loserLines = [
		'Петух проиграл, всё как обычно,',
		'Балыка в казино — <em>это типично!</em>',
		'Следующий раз повезёт, не плачь —',
		'Иди на завод, сделай <em>балыч!</em>',
	]
	dogEl.textContent = '😔'
	lyricsEl.innerHTML = loserLines.map(l => `<div>${l}</div>`).join('')
	box.style.display = 'flex'
	box.style.borderColor = '#666'
	box.querySelector('.rap-lyrics').style.color = '#aaa'
	setTimeout(() => {
		if (box) box.style.display = 'none'
	}, 3000)
}

function showRapMessage(type, text) {
	// fallback
	alert(text)
}

// Конфетти
function spawnRapConfetti(bigMode) {
	const count = bigMode ? 120 : 50
	const colors = [
		'#FF6B35',
		'#FFD700',
		'#FF3366',
		'#2ecc71',
		'#1d9bf0',
		'#a78bfa',
		'#ffffff',
	]
	for (let i = 0; i < count; i++) {
		setTimeout(() => {
			const el = document.createElement('div')
			el.className = 'rap-confetti'
			el.style.cssText = `
                left: ${Math.random() * 100}vw;
                top: -20px;
                width: ${4 + Math.random() * 8}px;
                height: ${8 + Math.random() * 16}px;
                background: ${colors[Math.floor(Math.random() * colors.length)]};
                animation-duration: ${1.5 + Math.random() * 2}s;
                animation-delay: ${Math.random() * 0.5}s;
            `
			document.body.appendChild(el)
			setTimeout(() => el.remove(), 3000)
		}, i * 20)
	}
}

// Фоновая анимация поля (звёзды/частицы)
function startRapBgAnim() {
	const canvas = document.getElementById('rapBgCanvas')
	if (!canvas) return
	const ctx = canvas.getContext('2d')

	rapBgParticles = []
	for (let i = 0; i < 40; i++) {
		rapBgParticles.push({
			x: Math.random(),
			y: Math.random(),
			size: 1 + Math.random() * 3,
			speedX: (Math.random() - 0.5) * 0.001,
			speedY: (Math.random() - 0.5) * 0.001,
			alpha: 0.1 + Math.random() * 0.4,
			color: ['#FF6B35', '#FFD700', '#FF3366', '#a78bfa'][
				Math.floor(Math.random() * 4)
			],
		})
	}

	function animate() {
		canvas.width = canvas.clientWidth
		canvas.height = canvas.clientHeight
		if (!canvas.width || !canvas.height) {
			rapBgAnimId = requestAnimationFrame(animate)
			return
		}
		ctx.clearRect(0, 0, canvas.width, canvas.height)

		// Тёмный фон с градиентом
		const grad = ctx.createLinearGradient(0, 0, canvas.width, canvas.height)
		grad.addColorStop(0, '#0a0508')
		grad.addColorStop(0.5, '#0d0810')
		grad.addColorStop(1, '#080510')
		ctx.fillStyle = grad
		ctx.fillRect(0, 0, canvas.width, canvas.height)

		// Двигаем частицы
		rapBgParticles.forEach(p => {
			p.x += p.speedX
			p.y += p.speedY
			if (p.x < 0 || p.x > 1) p.speedX *= -1
			if (p.y < 0 || p.y > 1) p.speedY *= -1

			ctx.beginPath()
			ctx.arc(p.x * canvas.width, p.y * canvas.height, p.size, 0, Math.PI * 2)
			ctx.fillStyle = p.color
			ctx.globalAlpha = p.alpha
			ctx.fill()
		})
		ctx.globalAlpha = 1

		rapBgAnimId = requestAnimationFrame(animate)
	}
	if (rapBgAnimId) cancelAnimationFrame(rapBgAnimId)
	animate()
}

function stopRapBgAnim() {
	if (rapBgAnimId) {
		cancelAnimationFrame(rapBgAnimId)
		rapBgAnimId = null
	}
}

function saveRapStats() {
	localStorage.setItem('rapStats', JSON.stringify(rapStats))
}

function loadRapStats() {
	const s = localStorage.getItem('rapStats')
	if (s) {
		rapStats = JSON.parse(s)
	}
	updateRapStats()
}

function updateRapStats() {
	const ts = document.getElementById('rapTotalSpins')
	const tw = document.getElementById('rapTotalWins')
	const bw = document.getElementById('rapBiggestWin')
	if (ts) ts.textContent = rapStats.spins
	if (tw) tw.textContent = rapStats.wins
	if (bw) bw.textContent = rapStats.biggestWin
}

function sleep(ms) {
	return new Promise(r => setTimeout(r, ms))
}

// ================================================================
// ИНТЕГРАЦИЯ: добавить карточку игры в Casino Menu
// В openCasinoGame добавить кейс 'rapdogs':
// ================================================================
// В HTML casino_menu добавить карточку:
/*
<div class="casino-game-card" onclick="openCasinoGame('rapdogs')">
    <div class="game-icon">🐕</div>
    <h3 class="game-title">Рэп-Собаки</h3>
    <p class="game-description">Поле 6×5! Собаки рэпуют про Балыку!</p>
    <div class="game-stats">
        <span>Ставка: от 5</span><span>Джекпот: x300</span>
    </div>
</div>
*/

// Патч openCasinoGame для поддержки rapdogs:
;(function () {
	const _orig = window.openCasinoGame
	window.openCasinoGame = function (gameName) {
		if (gameName === 'rapdogs') {
			document.getElementById('casinoMenu').style.display = 'none'
			const el = document.getElementById('rapDogsGame')
			if (el) {
				el.style.display = 'block'
				initRapField()
			}
			return
		}
		_orig(gameName)
	}

	const _origBack = window.backToCasinoMenu
	window.backToCasinoMenu = function () {
		stopRapBgAnim()
		clearRapDogs()
		const el = document.getElementById('rapDogsGame')
		if (el) el.style.display = 'none'
		_origBack()
	}
})()

// ================================================
// ПАТЧ JS v3 — НАСТРОЙКИ
// Найди в script.js блок "ПАТЧ v2" в самом конце
// и ЗАМЕНИ его полностью на этот код
// (или вставь в самый конец script.js если блока нет)
// ================================================

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 1. ТЕМА
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
window.setTheme = function (theme) {
	document.body.classList.toggle('theme-light', theme === 'light')
	const darkBtn = document.getElementById('themeDarkBtn')
	const lightBtn = document.getElementById('themeLightBtn')
	if (darkBtn) darkBtn.classList.toggle('active', theme === 'dark')
	if (lightBtn) lightBtn.classList.toggle('active', theme === 'light')
	localStorage.setItem('siteTheme', theme)
}

function loadSavedTheme() {
	const saved = localStorage.getItem('siteTheme') || 'dark'
	// Применяем без вызова setTheme чтобы не дергать UI до его загрузки
	document.body.classList.toggle('theme-light', saved === 'light')
	// Кнопки обновим после DOMContentLoaded
}

function syncThemeButtons() {
	const saved = localStorage.getItem('siteTheme') || 'dark'
	const darkBtn = document.getElementById('themeDarkBtn')
	const lightBtn = document.getElementById('themeLightBtn')
	if (darkBtn) darkBtn.classList.toggle('active', saved === 'dark')
	if (lightBtn) lightBtn.classList.toggle('active', saved === 'light')
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 2. МУЗЫКА
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const BG_TRACKS = [
	{ name: '🎸 Track 1', sub: 'audio1.mp3', file: 'img/song1.mp3' },
	{ name: '🎵 Track 2', sub: 'audio2.mp3', file: 'img/song3.mp3' },
	{ name: '🎶 Track 3', sub: 'audio3.mp3', file: 'img/song2.mp3' },
]

let bgMusicEnabled = false
let currentBgTrack = 0

function getBgPlayer() {
	return document.getElementById('bgMusicPlayer')
}

window.toggleMusic = function () {
	const toggle = document.getElementById('musicToggle')
	bgMusicEnabled = toggle ? toggle.checked : false
	const player = getBgPlayer()
	if (!player) return

	if (bgMusicEnabled) {
		const vol =
			parseFloat(document.getElementById('volumeSlider')?.value || 22) / 100
		player.src = BG_TRACKS[currentBgTrack].file
		player.volume = vol
		player.play().catch(e => console.log('Autoplay blocked:', e))
	} else {
		player.pause()
		player.currentTime = 0
	}
	syncTrackUI()
	localStorage.setItem('musicEnabled', bgMusicEnabled ? '1' : '0')
	localStorage.setItem('musicTrack', currentBgTrack)
}

window.selectTrack = function (idx) {
	currentBgTrack = idx
	const player = getBgPlayer()
	if (!player) return
	const vol =
		parseFloat(document.getElementById('volumeSlider')?.value || 22) / 100
	player.src = BG_TRACKS[idx].file
	player.volume = vol
	if (bgMusicEnabled) player.play().catch(e => console.log('Play error:', e))
	syncTrackUI()
	localStorage.setItem('musicTrack', idx)
}

function syncTrackUI() {
	BG_TRACKS.forEach((_, i) => {
		const el = document.getElementById('track_' + i)
		if (!el) return
		const isActive = bgMusicEnabled && i === currentBgTrack
		el.classList.toggle('active', isActive)
		const icon = el.querySelector('.settings-track-icon')
		if (icon) icon.textContent = isActive ? '▐▐' : '▶'
	})
}

window.changeVolume = function (val) {
	const player = getBgPlayer()
	if (player) player.volume = val / 100
	localStorage.setItem('musicVolume', val)
	// Обновляем иконку громкости
	const icon = document.querySelector('.settings-volume-icon')
	if (icon) {
		if (val == 0) icon.textContent = '🔇'
		else if (val < 40) icon.textContent = '🔈'
		else if (val < 70) icon.textContent = '🔉'
		else icon.textContent = '🔊'
	}
}

function loadMusicSettings() {
	const enabled = localStorage.getItem('musicEnabled') === '1'
	const trackIdx = parseInt(localStorage.getItem('musicTrack') || '0')
	const vol = parseFloat(localStorage.getItem('musicVolume') || '22')

	currentBgTrack = isNaN(trackIdx)
		? 0
		: Math.min(trackIdx, BG_TRACKS.length - 1)

	const volSlider = document.getElementById('volumeSlider')
	const volVal = document.getElementById('volumeVal')
	if (volSlider) volSlider.value = vol
	if (volVal) volVal.textContent = Math.round(vol) + '%'

	const player = getBgPlayer()
	if (player) player.volume = vol / 100

	const toggle = document.getElementById('musicToggle')
	if (toggle) toggle.checked = enabled
	bgMusicEnabled = enabled

	if (enabled && player) {
		player.src = BG_TRACKS[currentBgTrack].file
		player.loop = true
		player.play().catch(() => {})
	}
	syncTrackUI()
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 3. НАСТРОЙКИ: ОТКРЫТИЕ / ЗАКРЫТИЕ
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
window.openSettings = function () {
	const overlay = document.getElementById('settingsOverlay')
	if (overlay) overlay.classList.add('open')
	syncThemeButtons()
	syncTrackUI()

	// Синхронизируем данные профиля
	if (window.currentUser) {
		const av = document.getElementById('settingsAvatar')
		const un = document.getElementById('settingsUsername')
		const em = document.getElementById('settingsEmail')
		if (av)
			av.src = window.currentUser.photoURL || 'https://via.placeholder.com/52'
		if (un) un.textContent = window.currentUser.displayName || 'Пользователь'
		if (em) em.textContent = window.currentUser.email || ''
	}
}

window.closeSettings = function () {
	const overlay = document.getElementById('settingsOverlay')
	if (overlay) overlay.classList.remove('open')
}

window.handleSettingsOverlayClick = function (e) {
	if (e.target === document.getElementById('settingsOverlay')) closeSettings()
}

document.addEventListener('keydown', e => {
	if (e.key === 'Escape') closeSettings()
})

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 4. ОЗВУЧКА — Web Speech API
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
let speechEnabled = true
let lastSpokenText = ''
let lastSpeakTime = 0

function getPreferredVoice() {
	const voices = window.speechSynthesis
		? window.speechSynthesis.getVoices()
		: []
	return voices.find(v => v.lang.startsWith('ru')) || voices[0] || null
}

if (window.speechSynthesis) {
	window.speechSynthesis.onvoiceschanged = () => getPreferredVoice()
	window.speechSynthesis.getVoices()
}

// iOS Safari требует что speakPhrase вызывалась ТОЛЬКО внутри user gesture (click/touch)
// Поэтому храним очередь и воспроизводим при первом касании
let _speechQueue = []
let _speechUserUnlocked = false

function _flushSpeechQueue() {
	if (!_speechQueue.length) return
	const text = _speechQueue.shift()
	_doSpeak(text)
}

function _doSpeak(clean) {
	if (!window.speechSynthesis) return
	// iOS баг: синтез зависает — делаем cancel перед каждым speak
	try {
		window.speechSynthesis.cancel()
	} catch (e) {}

	const utt = new SpeechSynthesisUtterance(clean)
	utt.lang = 'ru-RU'
	utt.rate = 1.05
	utt.pitch = 1.0
	utt.volume = 1.0

	// iOS не грузит голоса сразу — пробуем несколько раз
	function trySpeak() {
		const voices = window.speechSynthesis.getVoices()
		const ruVoice = voices.find(v => v.lang.startsWith('ru'))
		if (ruVoice) utt.voice = ruVoice
		// Даже без голоса — говорим (будет дефолтный)
		try {
			window.speechSynthesis.speak(utt)
		} catch (e) {}
	}

	if (window.speechSynthesis.getVoices().length > 0) {
		trySpeak()
	} else {
		// Голоса ещё не загрузились — ждём
		window.speechSynthesis.onvoiceschanged = () => {
			window.speechSynthesis.onvoiceschanged = null
			trySpeak()
		}
		// Fallback если onvoiceschanged не сработает (iOS)
		setTimeout(trySpeak, 300)
	}
}

window.speakPhrase = function (text) {
	if (!speechEnabled) return
	if (!window.speechSynthesis) return
	if (!text) return

	const clean = text
		.replace(/<[^>]+>/g, '')
		.replace(/[🎤⛓️💩🐕👑💸🔥⭐🎰🐓🏆💥✅🔊🎸🎵🎶👋🎨🔈🔉🔊🔇🗣️]/gu, '')
		.trim()
	if (!clean || clean.length < 2) return

	const now = Date.now()
	if (clean === lastSpokenText && now - lastSpeakTime < 2000) return
	lastSpokenText = clean
	lastSpeakTime = now

	if (_speechUserUnlocked) {
		_doSpeak(clean)
	} else {
		// Пользователь ещё не нажал ничего — кладём в очередь
		_speechQueue = [clean] // только последнее, не накапливаем
	}
}

window.toggleSpeech = function (enabled) {
	speechEnabled = enabled
	if (!enabled && window.speechSynthesis) window.speechSynthesis.cancel()
	localStorage.setItem('speechEnabled', enabled ? '1' : '0')
}

function loadSpeechSettings() {
	const saved = localStorage.getItem('speechEnabled')
	speechEnabled = saved !== '0'
	const toggle = document.getElementById('speechToggle')
	if (toggle) toggle.checked = speechEnabled
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 5. ПАТЧИ КАЗИНО — ОЗВУЧКА
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// Рулетка
const _origShowResult_v3 = window.showResult
window.showResult = function (msg, type) {
	if (_origShowResult_v3) _origShowResult_v3(msg, type)
	setTimeout(() => {
		speakPhrase(type === 'win' ? 'Выигрыш!' : 'Проигрыш! Не повезло.')
	}, 200)
}

// Слоты
const _origShowSlotsResult_v3 = window.showSlotsResult
window.showSlotsResult = function (msg, type) {
	if (_origShowSlotsResult_v3) _origShowSlotsResult_v3(msg, type)
	setTimeout(() => {
		if (type === 'win') {
			speakPhrase(
				msg.includes('ФРИСПИН') || msg.includes('БОНУС')
					? 'Бонус! Фриспины!'
					: 'Выигрыш в слотах!',
			)
		} else {
			speakPhrase('Не повезло!')
		}
	}, 200)
}

// Крипто
const _origShowEthResult_v3 = window.showEthResult
window.showEthResult = function (msg, type) {
	if (_origShowEthResult_v3) _origShowEthResult_v3(msg, type)
	setTimeout(() => {
		speakPhrase(
			type === 'win'
				? 'Угадал! Крипто в плюсе!'
				: 'Не угадал. Курс ушёл не туда.',
		)
	}, 200)
}

// Рэп-собаки: победный оверлей
const _origShowRapWinOverlay_v3 = window.showRapWinOverlay
window.showRapWinOverlay = function (mult, isJackpot) {
	if (_origShowRapWinOverlay_v3) _origShowRapWinOverlay_v3(mult, isJackpot)
	if (isJackpot) speakPhrase('Джекпот! Петух сорвал куш!')
	else if (mult >= 50) speakPhrase('Мега выигрыш! Собаки воют!')
	else if (mult >= 20) speakPhrase('Большой выигрыш! Красавчик!')
	else if (mult >= 5) speakPhrase('Выигрыш в ' + Math.round(mult) + ' раз!')
	else speakPhrase('Выигрыш!')
}

// Рэп-собаки: лирика
const _origShowRapLyrics_v3 = window.showRapLyrics
window.showRapLyrics = function (lines, isJackpot) {
	if (_origShowRapLyrics_v3) _origShowRapLyrics_v3(lines, isJackpot)
	if (!lines || !lines.length) return
	const spoken = lines
		.slice(0, 2)
		.map(l => l.replace(/<[^>]+>/g, ''))
		.join('. ')
	setTimeout(() => speakPhrase(spoken), 400)
}

// Рэп-собаки: проигрыш
const _origShowRapLoserMessage_v3 = window.showRapLoserMessage
window.showRapLoserMessage = function () {
	if (_origShowRapLoserMessage_v3) _origShowRapLoserMessage_v3()
	const phrases = [
		'Не повезло, петух!',
		'Балыка снова в минусе!',
		'Завод ждёт тебя, Дима!',
	]
	speakPhrase(phrases[Math.floor(Math.random() * phrases.length)])
}

// Рэп-собаки: летящие псы говорят вслух
const _origSpawnRapDogs_v3 = window.spawnRapDogs
window.spawnRapDogs = function (count, isJackpot, isLose) {
	if (_origSpawnRapDogs_v3) _origSpawnRapDogs_v3(count, isJackpot, isLose)
	setTimeout(() => {
		if (isJackpot) {
			speakPhrase('Джекпот! Петух Балыки сорвал всё!')
		} else if (isLose) {
			speakPhrase(
				['Ха, петух проиграл!', 'Балыка плачет снова!', 'Иди на завод, Дима!'][
					Math.floor(Math.random() * 3)
				],
			)
		} else if (typeof RAP_LYRICS !== 'undefined' && RAP_LYRICS.length) {
			const idx = Math.floor(Math.random() * RAP_LYRICS.length)
			const line =
				RAP_LYRICS[idx][Math.floor(Math.random() * RAP_LYRICS[idx].length)]
			speakPhrase(line.replace(/<[^>]+>/g, ''))
		}
	}, 600)
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 6. ИНИЦИАЛИЗАЦИЯ
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Тему применяем сразу (до DOMContentLoaded)
loadSavedTheme()

document.addEventListener('DOMContentLoaded', () => {
	syncThemeButtons()
	loadSpeechSettings()
	setTimeout(loadMusicSettings, 300)
})

console.log('✅ Патч v3 настроек загружен')

// ================================================
// 5. ФОТО В ЧАТ
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// Максимальный размер фото перед отправкой (сжимаем)
const CHAT_IMG_MAX = 800

function compressChatImage(file, callback) {
	const reader = new FileReader()
	reader.onload = function (e) {
		const img = new Image()
		img.onload = function () {
			const canvas = document.createElement('canvas')
			let w = img.width,
				h = img.height
			if (w > CHAT_IMG_MAX || h > CHAT_IMG_MAX) {
				if (w > h) {
					h = Math.round((h * CHAT_IMG_MAX) / w)
					w = CHAT_IMG_MAX
				} else {
					w = Math.round((w * CHAT_IMG_MAX) / h)
					h = CHAT_IMG_MAX
				}
			}
			canvas.width = w
			canvas.height = h
			canvas.getContext('2d').drawImage(img, 0, 0, w, h)
			callback(canvas.toDataURL('image/jpeg', 0.82))
		}
		img.src = e.target.result
	}
	reader.readAsDataURL(file)
}

// Добавляем кнопку фото и превью в чат input
function upgradeChatInput() {
	const inputContainer = document.querySelector('.message-input-container')
	if (!inputContainer || inputContainer.dataset.photoReady) return
	inputContainer.dataset.photoReady = '1'

	// Скрытый input файла
	const fileInput = document.createElement('input')
	fileInput.type = 'file'
	fileInput.accept = 'image/*'
	fileInput.style.display = 'none'
	fileInput.id = 'chatPhotoInput'
	inputContainer.appendChild(fileInput)

	// Кнопка 📷
	const photoBtn = document.createElement('button')
	photoBtn.className = 'chat-photo-btn'
	photoBtn.innerHTML = '📷'
	photoBtn.title = 'Отправить фото'
	photoBtn.onclick = e => {
		e.preventDefault()
		fileInput.click()
	}
	inputContainer.insertBefore(
		photoBtn,
		inputContainer.querySelector('.message-input'),
	)

	// Превью выбранного фото
	const preview = document.createElement('div')
	preview.className = 'chat-photo-preview'
	preview.id = 'chatPhotoPreview'
	preview.style.display = 'none'
	inputContainer.parentElement.insertBefore(preview, inputContainer)

	let selectedImageData = null

	fileInput.addEventListener('change', function () {
		const file = this.files[0]
		if (!file) return
		compressChatImage(file, function (dataUrl) {
			selectedImageData = dataUrl
			preview.style.display = 'flex'
			preview.innerHTML = `
				<div class="chat-preview-inner">
					<img src="${dataUrl}" alt="preview">
					<button class="chat-preview-remove" onclick="removeChatPhoto()">✕</button>
				</div>
				<span class="chat-preview-label">Фото готово к отправке</span>
			`
		})
		this.value = ''
	})

	// Сохраняем data в window для отправки
	window._chatSelectedImage = null
	Object.defineProperty(window, '_chatSelectedImage', {
		get: () => selectedImageData,
		set: v => {
			selectedImageData = v
		},
	})

	window.removeChatPhoto = function () {
		selectedImageData = null
		preview.style.display = 'none'
		preview.innerHTML = ''
	}
}

// Патч sendMessage — добавляем поддержку фото
;(function () {
	const _origSendMessage = window.sendMessage
	window.sendMessage = async function () {
		const input = document.getElementById('messageInput')
		const text = input?.value.trim()
		const imgData = window._chatSelectedImage

		// Если нет ни текста ни фото — выходим
		if (!text && !imgData) return

		const username =
			window.currentUser?.displayName ||
			localStorage.getItem('chatUsername') ||
			'Гость'

		try {
			const msg = {
				username: username,
				text: text || '',
				timestamp: Date.now(),
			}
			if (imgData) msg.image = imgData

			await database.ref('messages').push(msg)

			if (input) {
				input.value = ''
				input.style.height = 'auto'
			}
			window.removeChatPhoto?.()
		} catch (e) {
			console.error('Ошибка отправки:', e)
			alert('Не удалось отправить: ' + e.message)
		}
	}
})()

// Патч loadChatMessages — рендерим фото в сообщениях
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ФОТО В ЧАТ — рендер сообщений с картинками
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
;(function () {
	// Глобальный просмотр фото
	window.openChatImageFull = function (shortSrc) {
		const img = document.querySelector(`[data-fullsrc^="${shortSrc}"]`)
		const fullSrc = img ? img.dataset.fullsrc : shortSrc
		const overlay = document.createElement('div')
		overlay.className = 'chat-image-fullscreen'
		overlay.innerHTML = `
			<div class="chat-image-fullscreen-bg" onclick="this.parentElement.remove()"></div>
			<img src="${fullSrc}" alt="фото">
			<button class="chat-image-close" onclick="this.parentElement.remove()">✕</button>
		`
		document.body.appendChild(overlay)
		requestAnimationFrame(() => overlay.classList.add('open'))
	}

	// Патчим loadChatMessages — рендерим фото
	window.loadChatMessages = function () {
		const container = document.getElementById('chatMessages')
		if (!container) return

		database.ref('messages').off('child_added')
		container.innerHTML =
			'<div class="loading-message">Загрузка сообщений...</div>'

		let firstLoad = true
		database
			.ref('messages')
			.orderByChild('timestamp')
			.limitToLast(50)
			.on('child_added', snap => {
				if (!container) return
				if (firstLoad) {
					container.innerHTML = ''
					firstLoad = false
				}
				if (container.querySelector(`[data-msg-id="${snap.key}"]`)) return

				const msg = snap.val()
				if (!msg) return

				const div = document.createElement('div')
				div.className = 'message'
				div.dataset.msgId = snap.key

				const time = new Date(msg.timestamp).toLocaleTimeString('ru-RU', {
					hour: '2-digit',
					minute: '2-digit',
				})

				let body = ''
				if (msg.text) body += `<div class="message-text">${msg.text}</div>`
				if (msg.image) {
					const shortSrc = msg.image.substring(0, 30)
					body += `<div class="message-image-wrap" style="margin-top:8px;max-width:280px;">
						<img src="${msg.image}"
							class="message-chat-image"
							style="width:100%;border-radius:12px;cursor:pointer;max-height:260px;object-fit:cover;border:1px solid #2f3336"
							onclick="openChatImageFull('${shortSrc}')"
							data-fullsrc="${msg.image}"
							loading="lazy"
							alt="фото">
					</div>`
				}

				div.innerHTML = `
					<div class="message-avatar">${(msg.username || '?').charAt(0).toUpperCase()}</div>
					<div class="message-content">
						<div class="message-header">
							<span class="message-username">${msg.username || 'Гость'}</span>
							<span class="message-time">${time}</span>
						</div>
						${body}
					</div>`

				container.appendChild(div)
				container.scrollTop = container.scrollHeight
				checkScrollPosition?.()
			})
	}

	// Инициализируем кнопку фото когда чат открывается
	const _origSwitch = window.switchTab
	window.switchTab = function (tab, btn) {
		_origSwitch(tab, btn)
		if (tab === 'chat') setTimeout(upgradeChatInput, 100)
	}

	document.addEventListener('DOMContentLoaded', () => {
		setTimeout(upgradeChatInput, 500)
	})
})()

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Мобильная озвучка (iOS fix — полный перезапуск)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
;(function () {
	// iOS требует: первый .speak() ОБЯЗАТЕЛЬНО внутри click/touchstart handler
	// После этого — работает свободно до следующего перехода страницы

	// Переопределяем speakPhrase полностью для iOS
	const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream

	if (isIOS) {
		let iosUnlocked = false
		let iosPendingText = null

		function iosSpeakNow(text) {
			if (!text || !window.speechSynthesis) return
			// На iOS нужно cancel() + небольшая задержка перед speak()
			window.speechSynthesis.cancel()
			setTimeout(() => {
				const utt = new SpeechSynthesisUtterance(text)
				utt.lang = 'ru-RU'
				utt.rate = 1.0
				utt.pitch = 1.0
				utt.volume = 1.0
				// Голос ищем каждый раз (на iOS может меняться)
				const voices = window.speechSynthesis.getVoices()
				const ru = voices.find(v => v.lang.startsWith('ru'))
				if (ru) utt.voice = ru
				try {
					window.speechSynthesis.speak(utt)
				} catch (e) {}
			}, 50)
		}

		// Перехватываем speakPhrase для iOS
		const _origSpeak = window.speakPhrase
		window.speakPhrase = function (text) {
			if (!speechEnabled) return
			if (!text) return
			const clean = text
				.replace(/<[^>]+>/g, '')
				.replace(/[🎤⛓️💩🐕👑💸🔥⭐🎰🐓🏆💥✅🔊🎸🎵🎶👋🎨🔈🔉🔊🔇🗣️]/gu, '')
				.trim()
			if (!clean || clean.length < 2) return

			const now = Date.now()
			if (clean === lastSpokenText && now - lastSpeakTime < 2000) return
			lastSpokenText = clean
			lastSpeakTime = now

			if (iosUnlocked) {
				iosSpeakNow(clean)
			} else {
				iosPendingText = clean // запоминаем последнюю фразу
			}
		}

		// Разблокировка iOS при первом touch
		function iosUnlock() {
			if (iosUnlocked) return
			iosUnlocked = true
			_speechUserUnlocked = true

			if (!window.speechSynthesis) return
			// Speak пустой utterance — разблокирует на iOS
			const unlock = new SpeechSynthesisUtterance(' ')
			unlock.volume = 0.01
			unlock.rate = 2
			unlock.lang = 'ru-RU'
			unlock.onend = () => {
				// После разблокировки — произносим отложенную фразу если была
				if (iosPendingText) {
					setTimeout(() => iosSpeakNow(iosPendingText), 100)
					iosPendingText = null
				}
			}
			try {
				window.speechSynthesis.speak(unlock)
			} catch (e) {}
		}

		document.addEventListener('touchstart', iosUnlock, { once: true })
		document.addEventListener('click', iosUnlock, { once: true })

		// iOS зависает через ~15с — сбрасываем
		setInterval(() => {
			if (window.speechSynthesis && window.speechSynthesis.speaking) {
				window.speechSynthesis.pause()
				setTimeout(() => {
					try {
						window.speechSynthesis.resume()
					} catch (e) {}
				}, 50)
			}
		}, 12000)
	} else {
		// Не iOS — оригинальный механизм
		function unlockSpeech() {
			if (_speechUserUnlocked) return
			_speechUserUnlocked = true
			if (window.speechSynthesis) {
				const utt = new SpeechSynthesisUtterance(' ')
				utt.volume = 0.01
				utt.rate = 2
				try {
					window.speechSynthesis.speak(utt)
				} catch (e) {}
				utt.onend = () => {
					setTimeout(_flushSpeechQueue, 100)
				}
			}
		}
		document.addEventListener('touchstart', unlockSpeech, { once: true })
		document.addEventListener('click', unlockSpeech, { once: true })

		setInterval(() => {
			if (!window.speechSynthesis) return
			if (window.speechSynthesis.speaking) {
				window.speechSynthesis.pause()
				window.speechSynthesis.resume()
			}
		}, 10000)
	}
})()

// ================================================
// ПАТЧ v7 ФИНАЛ — хедер + сайдбар (без пересборки вкладок!)
// ================================================
;(function () {
	'use strict'

	// ── 1. ХЕДЕР: шестерёнка стоит в HTML в правильном месте — ничего не трогаем ──

	// ── 2. БОКОВАЯ ПАНЕЛЬ: порядок chat → ai → ambassadors ──
	function patchSidebarOrder() {
		const sidebar = document.querySelector('.sidebar-nav')
		if (!sidebar || sidebar.dataset.v7order) return
		sidebar.dataset.v7order = '1'
		const allBtns = Array.from(sidebar.querySelectorAll('.tab-btn'))
		const find = name =>
			allBtns.find(b =>
				(b.getAttribute('onclick') || '').includes("'" + name + "'"),
			)
		const chatBtn = find('chat')
		const aiBtn = find('ai')
		const ambBtn = find('ambassadors')
		const ordered = [chatBtn, aiBtn, ambBtn].filter(Boolean)
		const rest = allBtns.filter(b => !ordered.includes(b))
		const frag = document.createDocumentFragment()
		;[...ordered, ...rest].forEach(b => b && frag.appendChild(b))
		sidebar.appendChild(frag)
	}

	function run() {
		patchSidebarOrder()
	}

	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', run)
	} else {
		run()
	}

	console.log('✅ Патч v7 ФИНАЛ загружен')
})()

// ================================================
// ВКЛАДКИ — switchAmbTab + switchSlapTab
// (функции глобальные, вызываются из onclick в HTML)
// ================================================

window.switchAmbTab = function (tab, btn) {
	document
		.querySelectorAll('#ambassadors .amb-tab-content')
		.forEach(c => c.classList.remove('active'))
	document
		.querySelectorAll('#ambassadors .amb-tab-btn')
		.forEach(b => b.classList.remove('active'))
	const el = document.getElementById(
		tab === 'contacts' ? 'ambContacts' : 'ambRating',
	)
	if (el) el.classList.add('active')
	if (btn) btn.classList.add('active')
	if (tab === 'rating') setTimeout(drawConnections, 100)
}

window.switchSlapTab = function (tab, btn) {
	document
		.querySelectorAll('#slap .slap-inner-content')
		.forEach(c => c.classList.remove('active'))
	document
		.querySelectorAll('#slap .slap-inner-tab-btn')
		.forEach(b => b.classList.remove('active'))
	const el = document.getElementById(
		tab === 'farm' ? 'slapFarmContent' : 'slapFactoryContent',
	)
	if (el) el.classList.add('active')
	if (btn) btn.classList.add('active')
	if (tab === 'factory') {
		const d = document.getElementById('factoryDumpling')
		const s = document.getElementById('factorySandwich')
		if (d) d.textContent = window._factoryDumplings || 0
		if (s) s.textContent = window._factorySandwiches || 0
	}
}

// Скрываем кнопку Завод в nav на старте (на случай если она есть в HTML)
document.addEventListener('DOMContentLoaded', function () {
	const factBtn = document.getElementById('factoryNavBtn')
	if (factBtn) factBtn.style.display = 'none'
})

// =====================================================
// SOUNDS.JS v5 — реальные mp3 сэмплы
// =====================================================
;(function () {
	'use strict'

	const BASE = 'img/'
	const cache = {}

	function load(name) {
		if (cache[name]) return cache[name]
		const a = new Audio(BASE + name + '.mp3')
		a.preload = 'auto'
		cache[name] = a
		return a
	}

	function play(name, vol) {
		try {
			const a = load(name).cloneNode()
			a.volume = vol !== undefined ? vol : 1.0
			a.play().catch(() => {})
		} catch (e) {}
	}

	const FILES = [
		'slap',
		'whoosh',
		'dick_hit',
		'clown_laugh',
		'conveyor_start',
		'factory_press',
		'casino_spin',
		'casino_win',
		'casino_lose',
		'casino_bigwin',
		'punch',
	]
	FILES.forEach(f => load(f))

	window.SND = {}
	window.SND.slap = () => play('slap', 0.95)
	window.SND.whoosh = () => play('whoosh', 0.9)
	window.SND.dickHit = () => play('dick_hit', 0.92)
	window.SND.clownLaugh = () => play('clown_laugh', 0.88)
	window.SND.conveyorStart = () => play('conveyor_start', 0.85)
	window.SND.factoryPress = () => play('factory_press', 0.9)
	window.SND.casinoSpin = () => play('casino_spin', 0.8)
	window.SND.casinoWin = () => play('casino_win', 0.88)
	window.SND.casinoLose = () => play('casino_lose', 0.85)
	window.SND.casinoBigWin = () => play('casino_bigwin', 0.9)

	let _punchLast = 0
	window.SND.punch = function (force) {
		const now = Date.now()
		if (now - _punchLast < 85) return
		_punchLast = now
		play('punch', Math.max(0.3, Math.min(1.0, force || 0.65)))
	}

	window.SND.speakKickText = function (text) {
		if (Math.random() > 0.5 || !window.speechSynthesis) return
		const clean = text.replace(/[^\p{L}\p{N}\s!?]/gu, '').trim()
		if (!clean || clean.length < 2) return
		const u = new SpeechSynthesisUtterance(clean)
		u.lang = 'ru-RU'
		u.rate = 1.4 + Math.random() * 0.7
		u.pitch = 0.4 + Math.random() * 1.7
		u.volume = 0.95
		try {
			window.speechSynthesis.cancel()
			window.speechSynthesis.speak(u)
		} catch (e) {}
	}

	window.SND.speakFactoryResult = function (text) {
		if (!window.speechSynthesis) return
		const clean = text.replace(/[^\p{L}\p{N}\s!?]/gu, '').trim()
		if (!clean) return
		const u = new SpeechSynthesisUtterance(clean.substring(0, 60))
		u.lang = 'ru-RU'
		u.rate = 1.05
		u.pitch = 0.7
		u.volume = 0.9
		try {
			window.speechSynthesis.cancel()
			window.speechSynthesis.speak(u)
		} catch (e) {}
	}

	console.log('🔊 SND v5 загружен!')
})()

// ── Патч doSlap: писюн = whoosh + dickHit через 480мс ──
;(function () {
	const _orig = window.doSlap
	window.doSlap = function () {
		// Переопределяем только звуковую часть
		if (window.SND) {
			if (window.currentWeapon === 'dick') {
				window.SND.whoosh()
				setTimeout(() => window.SND && window.SND.dickHit(), 480)
			} else {
				window.SND.slap()
			}
		}
		// Вызываем оригинал БЕЗ звука — патчим внутренний if(window.SND)
		const origSND = window.SND
		window.SND = null
		_orig && _orig()
		window.SND = origSND
	}
})()

// ── Патч tryHit: удар в Кик Зоне ──
;(function () {
	// Ждём инициализации kick game
	const _interval = setInterval(() => {
		const canvas = document.getElementById('kickCanvas')
		if (!canvas) return
		clearInterval(_interval)

		// Перехватываем mousedown/touchstart на canvas
		const origDown = canvas.onmousedown
		canvas.onmousedown = function (e) {
			if (origDown) origDown.call(this, e)
			// punch срабатывает в tryHit — патчим через событие
		}
	}, 500)

	// Более надёжный способ: патчим applyHit через глобальный слушатель
	document.addEventListener('mousedown', function (e) {
		const canvas = document.getElementById('kickCanvas')
		if (!canvas || !canvas.isConnected) return
		if (e.target !== canvas) return
		if (window.SND) window.SND.punch(0.9)
	})
	document.addEventListener(
		'touchstart',
		function (e) {
			const canvas = document.getElementById('kickCanvas')
			if (!canvas || !canvas.isConnected) return
			if (e.target !== canvas) return
			if (window.SND) window.SND.punch(0.9)
		},
		{ passive: true },
	)
})()

// ========================================
// TOPUP MODAL (Пополнение баланса)
// ========================================
window.openTopupModal = function () {
	document.getElementById('topupModal').classList.add('active')
}
window.closeTopupModal = function (e) {
	if (e && e.target !== document.getElementById('topupModal')) return
	document.getElementById('topupModal').classList.remove('active')
}
window.closeTopupModalForce = function () {
	document.getElementById('topupModal').classList.remove('active')
}

// ========================================
// KICK LEADERS
// ========================================
window.toggleKickLeaders = function () {
	const overlay = document.getElementById('kickLeadersOverlay')
	if (overlay.classList.contains('open')) {
		overlay.classList.remove('open')
	} else {
		overlay.classList.add('open')
	}
}
window.closeKickLeaders = function (e) {
	if (e && e.target !== document.getElementById('kickLeadersOverlay')) return
	document.getElementById('kickLeadersOverlay').classList.remove('open')
}
window.closeKickLeadersForce = function () {
	document.getElementById('kickLeadersOverlay').classList.remove('open')
}

// ========================================
// EPSTEIN SUBTABS
// ========================================
window.switchEpsteinTab = function (tab, btn) {
	document
		.querySelectorAll('.epstein-sub-content')
		.forEach(el => el.classList.remove('active'))
	document
		.querySelectorAll('.epstein-subtab-btn')
		.forEach(el => el.classList.remove('active'))
	document
		.getElementById('epstein' + tab.charAt(0).toUpperCase() + tab.slice(1))
		.classList.add('active')
	if (btn) btn.classList.add('active')
}

// ========================================
// ПРОМОКОДЫ — FIREBASE (не захардкожено!)
// Промокоды хранятся в Firebase: /promoCodes/{code}
// Структура: { reward, emoji, name, description, maxUses, usedCount, active }
// Создаются через АДМИН-ПАНЕЛЬ
// ========================================

// --- ОТКРЫТЬ ПРОМО МОДАЛ ---
window.openPromoModal = function () {
	document.getElementById('topupModal').classList.remove('active')
	const input = document.getElementById('promoCodeInput')
	const errEl = document.getElementById('promoError')
	if (input) input.value = ''
	if (errEl) errEl.textContent = ''
	document.getElementById('promoModal').classList.add('active')
}

window.closePromoModal = function (e) {
	if (e && e.target !== document.getElementById('promoModal')) return
	document.getElementById('promoModal').classList.remove('active')
}

// --- ПРИМЕНИТЬ ПРОМОКОД ---
window.submitPromoCode = async function () {
	if (!window.currentUser) {
		document.getElementById('promoError').textContent = '❌ Войдите в аккаунт!'
		return
	}
	const input = document.getElementById('promoCodeInput')
	const errorEl = document.getElementById('promoError')
	const btn = document.querySelector('.promo-submit-btn')
	const code = input.value.trim().toUpperCase()

	if (!code) {
		errorEl.textContent = '❌ Введи промокод!'
		return
	}

	btn.disabled = true
	errorEl.textContent = 'Проверяем...'

	try {
		const uid = window.currentUser.uid

		// 1. Получаем данные промокода из Firebase
		const promoSnap = await database.ref(`promoCodes/${code}`).once('value')

		if (!promoSnap.exists()) {
			errorEl.textContent = '❌ Промокод не существует или уже недействителен'
			input.style.borderColor = '#f4212e'
			setTimeout(() => {
				input.style.borderColor = ''
			}, 1500)
			btn.disabled = false
			return
		}

		const promo = promoSnap.val()

		// 2. Проверяем — активен ли
		if (promo.active === false) {
			errorEl.textContent = '❌ Промокод деактивирован'
			btn.disabled = false
			return
		}

		// 3. Проверяем — не использовал ли этот юзер
		const userUsedSnap = await database
			.ref(`users/${uid}/usedPromos/${code}`)
			.once('value')
		if (userUsedSnap.exists()) {
			errorEl.textContent = '❌ Ты уже использовал этот промокод!'
			btn.disabled = false
			return
		}

		// 4. Проверяем лимит использований
		if (
			promo.maxUses &&
			promo.maxUses > 0 &&
			(promo.usedCount || 0) >= promo.maxUses
		) {
			errorEl.textContent = '❌ Лимит промокода исчерпан'
			btn.disabled = false
			return
		}

		// 5. Всё ок — фиксируем использование (транзакция)
		await database
			.ref(`promoCodes/${code}/usedCount`)
			.transaction(cur => (cur || 0) + 1)
		await database.ref(`users/${uid}/usedPromos/${code}`).set(Date.now())

		// 6. Кладём тикет в инвентарь юзера
		const ticket = {
			type: 'promo_ticket',
			code: code,
			emoji: promo.emoji || '🎟️',
			name: promo.name || 'Промокод ' + code,
			description: promo.description || 'Активируй, чтобы получить награду.',
			reward: promo.reward || 0,
			activated: false,
			addedAt: Date.now(),
		}
		console.log(
			'[Promo] Записываем в инвентарь:',
			`users/${uid}/inventory`,
			ticket,
		)
		const pushRef = await database.ref(`users/${uid}/inventory`).push(ticket)
		console.log('[Promo] ✅ Тикет добавлен, ключ:', pushRef.key)

		// 7. Закрываем, показываем тост
		document.getElementById('promoModal').classList.remove('active')
		showInventoryToast(
			'🎟️ Тикет «' + ticket.name + '» добавлен в инвентарь! Открой 🎒',
		)
		// Сбросить listener чтобы при следующем открытии инвентаря данные загрузились свежо
		if (inventoryListener && inventoryListenerUid) {
			database
				.ref(`users/${inventoryListenerUid}/inventory`)
				.off('value', inventoryListener)
			inventoryListener = null
			inventoryListenerUid = null
		}
	} catch (e) {
		errorEl.textContent = '❌ Ошибка: ' + e.message
	}
	btn.disabled = false
}

// ========================================
// ИНВЕНТАРЬ
// ========================================
let inventoryItems = []
let selectedInvItem = null

window.openInventory = async function () {
	if (!window.currentUser) {
		showInventoryToast('⚠️ Войдите в аккаунт!')
		return
	}
	document.getElementById('inventoryModal').classList.add('active')
	await loadInventory()
}

window.closeInventoryModal = function (e) {
	if (e && e.target !== document.getElementById('inventoryModal')) return
	document.getElementById('inventoryModal').classList.remove('active')
	// Detach listener to avoid memory leaks
	if (inventoryListener && inventoryListenerUid) {
		database
			.ref(`users/${inventoryListenerUid}/inventory`)
			.off('value', inventoryListener)
		inventoryListener = null
		inventoryListenerUid = null
	}
}

let inventoryListener = null
let inventoryListenerUid = null

async function loadInventory() {
	const uid = window.currentUser?.uid
	if (!uid) return
	const grid = document.getElementById('inventoryGrid')
	if (!grid) return
	grid.innerHTML =
		'<div style="color:var(--text-secondary);font-size:0.85rem;grid-column:1/-1;text-align:center;padding:20px;">Загружаем...</div>'

	// Detach previous listener if different user
	if (inventoryListener && inventoryListenerUid !== uid) {
		database
			.ref(`users/${inventoryListenerUid}/inventory`)
			.off('value', inventoryListener)
		inventoryListener = null
	}

	// Use real-time listener so inventory updates instantly after promo activation
	if (!inventoryListener) {
		inventoryListenerUid = uid
		inventoryListener = database.ref(`users/${uid}/inventory`).on(
			'value',
			snap => {
				inventoryItems = []
				if (snap && snap.exists()) {
					snap.forEach(c => {
						const v = c.val()
						if (v) inventoryItems.push({ key: c.key, ...v })
					})
				}
				console.log(
					'[Inventory] Загружено предметов:',
					inventoryItems.length,
					inventoryItems,
				)
				selectedInvItem = null
				renderInventory()
			},
			err => {
				console.error('[Inventory] Ошибка Firebase:', err.code, err.message)
				const g = document.getElementById('inventoryGrid')
				if (g)
					g.innerHTML = `<div style="color:#f4212e;font-size:0.85rem;grid-column:1/-1;text-align:center;padding:20px;">Ошибка: ${err.message}</div>`
			},
		)
	}
}

function renderInventory() {
	const grid = document.getElementById('inventoryGrid')
	if (!grid) return
	const SLOTS = 20
	let html = ''

	inventoryItems.forEach(item => {
		const sel =
			selectedInvItem && selectedInvItem.key === item.key ? 'selected' : ''
		const opacity = item.activated ? 'style="opacity:0.4;"' : ''
		html += `<div class="inv-slot ${sel}" ${opacity} onclick="selectInvItem('${item.key}')" title="${item.name}">
            ${item.emoji || '🎟️'}
            ${item.activated ? '<div class="inv-slot-count">✓</div>' : ''}
        </div>`
	})

	for (let i = inventoryItems.length; i < SLOTS; i++) {
		html += '<div class="inv-slot inv-slot-empty"></div>'
	}

	grid.innerHTML = html

	if (selectedInvItem) {
		const fresh = inventoryItems.find(x => x.key === selectedInvItem.key)
		renderInfoPanel(fresh || null)
	} else {
		renderInfoPanel(null)
	}
}

window.selectInvItem = function (key) {
	selectedInvItem = inventoryItems.find(x => x.key === key) || null
	renderInventory()
}

function renderInfoPanel(item) {
	const panel = document.getElementById('inventoryInfoPanel')
	if (!panel) return

	if (!item) {
		panel.innerHTML =
			'<div class="inventory-info-empty">Выбери предмет, чтобы увидеть описание</div>'
		return
	}

	const reward = item.reward || 0
	const rewardClass = reward >= 0 ? 'positive' : 'negative'
	const rewardSign = reward >= 0 ? '+' : ''
	const rewardHtml =
		reward !== 0
			? `<div class="inv-info-bonus ${rewardClass}">${rewardSign}${reward.toLocaleString('ru-RU')} монет при активации</div>`
			: ''

	const activateBtn = item.activated
		? `<button class="inv-activate-btn" disabled>✓ Уже активирован</button>`
		: `<button class="inv-activate-btn" onclick="activateItem('${item.key}')">Активировать 🔓</button>`

	panel.innerHTML = `
        <div style="display:flex;align-items:center;gap:10px;">
            <span style="font-size:2rem;">${item.emoji || '🎟️'}</span>
            <div class="inv-info-name">${item.name}</div>
        </div>
        <div class="inv-info-desc">${item.description || ''}</div>
        ${rewardHtml}
        ${activateBtn}
    `
}

window.activateItem = async function (key) {
	const item = inventoryItems.find(x => x.key === key)
	if (!item || item.activated) return

	const uid = window.currentUser.uid
	const btn = document.querySelector('.inv-activate-btn')
	if (btn) btn.disabled = true

	try {
		if (item.reward && item.reward !== 0) {
			userCurrency = Math.max(0, userCurrency + item.reward)
			updateCurrencyDisplay()
			saveCurrencyToFirebase()
		}
		await database.ref(`users/${uid}/inventory/${key}/activated`).set(true)
		item.activated = true

		const msg =
			item.reward >= 0
				? `✅ Активировано! +${item.reward.toLocaleString('ru-RU')} монет!`
				: `💀 Активировано! ${item.reward.toLocaleString('ru-RU')} монет. Ха!`
		showInventoryToast(msg)
		renderInventory()
	} catch (e) {
		showInventoryToast('❌ Ошибка: ' + e.message)
		if (btn) btn.disabled = false
	}
}

// Тост
function showInventoryToast(msg) {
	let toast = document.getElementById('invToast')
	if (!toast) {
		toast = document.createElement('div')
		toast.id = 'invToast'
		toast.style.cssText =
			'position:fixed;bottom:28px;left:50%;transform:translateX(-50%) translateY(80px);background:var(--bg-card);border:1px solid var(--border);color:var(--text-primary);padding:12px 22px;border-radius:50px;font-size:0.9rem;font-weight:600;z-index:99999;transition:transform 0.3s ease;pointer-events:none;text-align:center;max-width:90%;box-shadow:0 4px 20px rgba(0,0,0,0.4);'
		document.body.appendChild(toast)
	}
	toast.textContent = msg
	toast.style.transform = 'translateX(-50%) translateY(0)'
	clearTimeout(toast._timer)
	toast._timer = setTimeout(() => {
		toast.style.transform = 'translateX(-50%) translateY(80px)'
	}, 3500)
}

// ========================================
// ADMIN — ПРОМОКОДЫ (создание/управление)
// ========================================

// Расширяем существующий loadAdminPanel — добавляем секцию промокодов
const _origLoadAdminPanel = window.loadAdminPanel
window.loadAdminPanel = async function () {
	if (_origLoadAdminPanel) await _origLoadAdminPanel()
	loadAdminPromos()
}

async function loadAdminPromos() {
	const container = document.getElementById('adminPromoSection')
	if (!container) return

	container.innerHTML =
		'<div style="color:var(--text-secondary);padding:12px;">Загрузка промокодов...</div>'

	try {
		const snap = await database.ref('promoCodes').once('value')
		let html = ''

		if (snap.exists()) {
			snap.forEach(c => {
				const p = c.val()
				const code = c.key
				const statusColor = p.active !== false ? '#00ba7c' : '#f4212e'
				const statusText = p.active !== false ? 'активен' : 'выкл'
				const reward = p.reward || 0
				const rewardStr = reward >= 0 ? `+${reward}` : `${reward}`
				html += `<div class="admin-promo-row">
                    <span class="admin-promo-code">${code}</span>
                    <span class="admin-promo-name">${p.name || '—'}</span>
                    <span class="admin-promo-reward" style="color:${reward >= 0 ? '#00ba7c' : '#f4212e'}">${rewardStr} монет</span>
                    <span class="admin-promo-uses">${p.usedCount || 0}/${p.maxUses > 0 ? p.maxUses : '∞'}</span>
                    <span style="color:${statusColor};font-size:0.8rem;font-weight:700;">${statusText}</span>
                    <span class="admin-promo-actions">
                        <button class="admin-btn" onclick="adminTogglePromo('${code}', ${p.active !== false})" title="${p.active !== false ? 'Деактивировать' : 'Активировать'}">${p.active !== false ? '🔴' : '🟢'}</button>
                        <button class="admin-btn admin-btn-sub" onclick="adminDeletePromo('${code}')" title="Удалить">🗑️</button>
                    </span>
                </div>`
			})
		} else {
			html =
				'<div style="color:var(--text-secondary);padding:12px;font-size:0.85rem;">Промокодов пока нет</div>'
		}

		container.innerHTML = html
	} catch (e) {
		container.innerHTML = `<div style="color:#f4212e;padding:12px;">Ошибка: ${e.message}</div>`
	}
}

window.adminCreatePromo = async function () {
	const code = document
		.getElementById('newPromoCode')
		.value.trim()
		.toUpperCase()
	const name = document.getElementById('newPromoName').value.trim()
	const desc = document.getElementById('newPromoDesc').value.trim()
	const emoji = document.getElementById('newPromoEmoji').value.trim() || '🎟️'
	const reward = parseInt(document.getElementById('newPromoReward').value) || 0
	const maxUses =
		parseInt(document.getElementById('newPromoMaxUses').value) || 0
	const errEl = document.getElementById('newPromoError')

	if (!code || !name) {
		errEl.textContent = '❌ Код и название обязательны!'
		return
	}
	if (!/^[A-Z0-9_А-ЯЁ]{2,30}$/.test(code)) {
		errEl.textContent = '❌ Код: латиница/кириллица/цифры/_, 2-30 символов'
		return
	}

	errEl.textContent = ''

	// Проверяем — уже есть такой?
	const existing = await database.ref(`promoCodes/${code}`).once('value')
	if (existing.exists()) {
		errEl.textContent = '❌ Такой код уже существует!'
		return
	}

	try {
		await database.ref(`promoCodes/${code}`).set({
			name,
			description: desc,
			emoji,
			reward,
			maxUses,
			usedCount: 0,
			active: true,
			createdAt: Date.now(),
		})
		// Очищаем форму
		document.getElementById('newPromoCode').value = ''
		document.getElementById('newPromoName').value = ''
		document.getElementById('newPromoDesc').value = ''
		document.getElementById('newPromoEmoji').value = ''
		document.getElementById('newPromoReward').value = ''
		document.getElementById('newPromoMaxUses').value = ''
		errEl.textContent = ''
		showInventoryToast('✅ Промокод ' + code + ' создан!')
		loadAdminPromos()
	} catch (e) {
		errEl.textContent = '❌ Ошибка: ' + e.message
	}
}

window.adminTogglePromo = async function (code, isActive) {
	await database.ref(`promoCodes/${code}/active`).set(!isActive)
	loadAdminPromos()
}

window.adminDeletePromo = async function (code) {
	if (!confirm(`Удалить промокод «${code}»? Это действие необратимо.`)) return
	await database.ref(`promoCodes/${code}`).remove()
	showInventoryToast('🗑️ Промокод ' + code + ' удалён')
	loadAdminPromos()
}

// ========================================
// PLINKO КАЗИНО
// ========================================
;(function () {
	let plinkoRows = 8
	let plinkoBallsCount = 1
	let plinkoAnimating = false
	let plinkoStats = { games: 0, won: 0, lost: 0, maxMult: 0 }
	try { const _s = localStorage.getItem('plinkoStats'); if (_s) plinkoStats = JSON.parse(_s) } catch(e) {}
	// Plinko sounds (base64 WAV embedded)
	;(function() {
		function mkAudio(b64) {
			try { const a = new Audio('data:audio/wav;base64,' + b64); a.load(); return a } catch(e) { return null }
		}
		window._plinkoTick = mkAudio( + snd.TICK + )
		window._plinkoWin  = mkAudio( + snd.WIN  + )
		window._plinkoLose = mkAudio( + snd.LOSE + )
	})()

	// Multiplier tables by row count (center = low, edges = high)
	const MULT_TABLES = {
		8:  [8, 3, 1.2, 0.4, 0.2, 0.4, 1.2, 3, 8],
		12: [15, 5, 2, 0.8, 0.4, 0.2, 0.1, 0.2, 0.4, 0.8, 2, 5, 15],
		16: [50, 12, 5, 2, 0.8, 0.4, 0.2, 0.1, 0.1, 0.1, 0.2, 0.4, 0.8, 2, 5, 12, 50],
	}

	const MULT_COLORS = {
		50:   '#ff2244', 15:   '#ff4422', 12:   '#ff5500',
		8:    '#ff7700', 5:    '#ffaa00', 3:    '#ffcc00',
		2:    '#ccdd00', 1.2:  '#88bb00', 0.8:  '#4488cc',
		0.4:  '#2255aa', 0.2:  '#1a3388', 0.1:  '#111155',
	}

	function getMultColor(m) {
		if (MULT_COLORS[m]) return MULT_COLORS[m]
		if (m >= 10) return '#ff4422'
		if (m >= 3)  return '#ffaa00'
		if (m >= 1)  return '#88bb00'
		if (m >= 0.4) return '#2255aa'
		return '#111155'
	}

	function setupCanvas() {
		const canvas = document.getElementById('plinkoCanvas')
		if (!canvas) return null
		const cols = MULT_TABLES[plinkoRows].length
		const cellW = Math.min(36, Math.floor(480 / (cols + 1)))
		const W = cellW * (cols + 1)
		const H = cellW * (plinkoRows + 4)
		canvas.width = W
		canvas.height = H
		canvas.style.width = Math.min(W, 480) + 'px'
		canvas.style.height = (H * Math.min(W, 480)) / W + 'px'
		return { canvas, ctx: canvas.getContext('2d'), W, H, cellW, cols }
	}

	function drawBoard(setup, highlighted) {
		const { canvas, ctx, W, H, cellW, cols } = setup
		const mults = MULT_TABLES[plinkoRows]
		ctx.clearRect(0, 0, W, H)

		// Draw pegs
		ctx.fillStyle = '#888'
		for (let row = 0; row < plinkoRows; row++) {
			const pegsInRow = row + 2
			const xStart = (W - (pegsInRow - 1) * cellW) / 2
			for (let col = 0; col < pegsInRow; col++) {
				const x = xStart + col * cellW
				const y = cellW * 1.5 + row * cellW
				ctx.beginPath()
				ctx.arc(x, y, cellW * 0.13, 0, Math.PI * 2)
				ctx.fill()
			}
		}

		// Draw buckets
		const bucketsY = cellW * 1.5 + plinkoRows * cellW + cellW * 0.5
		const bucketW = cellW * 0.85
		const xOffset = (W - mults.length * cellW) / 2
		mults.forEach((m, i) => {
			const bx = xOffset + i * cellW + cellW * 0.075
			const isHit = highlighted !== undefined && highlighted === i
			ctx.fillStyle = isHit ? '#ffffff' : getMultColor(m)
			ctx.globalAlpha = isHit ? 1 : 0.85
			ctx.beginPath()
			ctx.roundRect(bx, bucketsY, bucketW, cellW * 0.75, 4)
			ctx.fill()
			ctx.globalAlpha = 1
			ctx.fillStyle = '#fff'
			ctx.font = `bold ${Math.max(8, cellW * 0.28)}px Inter,sans-serif`
			ctx.textAlign = 'center'
			const label = m >= 1 ? m + 'x' : m + 'x'
			ctx.fillText(label, bx + bucketW / 2, bucketsY + cellW * 0.52)
		})
	}

	function simulatePath(rows) {
		let pos = 0
		for (let r = 0; r < rows; r++) {
			pos += Math.random() < 0.5 ? 0 : 1
		}
		return pos
	}

	// animateBall: uses setTimeout so it always completes (rAF pauses on hidden tabs)
	function animateBall(setup, path, color) {
		return new Promise(resolve => {
			const { ctx, W, H, cellW } = setup
			const mults = MULT_TABLES[plinkoRows]
			const r = cellW * 0.21
			let row = 0
			let ballPos = 0

			function step() {
				drawBoard(setup)
				const pegsInRow = row + 2
				const xStartRow = (W - (pegsInRow - 1) * cellW) / 2
				const x = xStartRow + ballPos * cellW
				const y = cellW * 1.5 + row * cellW

				ctx.beginPath()
				ctx.arc(x, y, r, 0, Math.PI * 2)
				ctx.fillStyle = color
				ctx.shadowColor = color
				ctx.shadowBlur = 12
				ctx.fill()
				ctx.shadowBlur = 0
				ctx.strokeStyle = 'rgba(255,255,255,0.7)'
				ctx.lineWidth = 1.5
				ctx.stroke()

				if (path[row] !== undefined) ballPos = path[row]
				row++
				if (row > plinkoRows) {
					const bucketIdx = Math.min(ballPos, mults.length - 1)
					drawBoard(setup, bucketIdx)
					// play tick sound
					if (window._plinkoTick) {
						try { const s = window._plinkoTick.cloneNode(); s.volume = 0.35; s.play() } catch(e) {}
					}
					resolve(bucketIdx)
					return
				}
				// play tick on each pin hit
				if (window._plinkoTick) {
					try { const s = window._plinkoTick.cloneNode(); s.volume = 0.18; s.play() } catch(e) {}
				}
				setTimeout(step, 160)
			}
			step()
		})
	}

	function updatePlinkoBalance() {
		const el = document.getElementById('plinkoBalance')
		if (el) el.textContent = Math.round(userCurrency)
		updateCurrencyDisplay()
		saveCurrencyToFirebase()
	}

	function showPlinkoMsg(text, color, bg, border) {
		const el = document.getElementById('plinkoResult')
		if (!el) return
		clearTimeout(el._t)
		el.innerHTML = text
		el.style.cssText = 'display:block;opacity:1;transform:none;margin:12px 0 0;padding:14px 18px;border-radius:12px;font-size:1.1rem;font-weight:700;text-align:center;transition:opacity 0.4s;color:' + (color||'#fff') + ';background:' + (bg||'rgba(255,255,255,0.08)') + ';border:2px solid ' + (border||color||'#fff')
		el._t = setTimeout(() => {
			el.style.opacity = '0'
			setTimeout(() => { el.style.display = 'none'; el.innerHTML = '' }, 400)
		}, 4000)
	}

	window.dropPlinkoBalls = async function () {
		if (plinkoAnimating) return
		if (!window.currentUser) {
			showPlinkoMsg('❌ Войдите в аккаунт!', '#f4212e', 'rgba(244,33,46,0.12)', '#f4212e')
			return
		}
		const inp = document.getElementById('plinkoBetInput')
		const betPerBall = Math.max(1, parseInt(inp?.value) || 10)
		const totalBet = betPerBall * plinkoBallsCount
		if (userCurrency < totalBet) {
			showPlinkoMsg('❌ Недостаточно монет! Нужно ' + totalBet, '#f4212e', 'rgba(244,33,46,0.12)', '#f4212e')
			return
		}

		plinkoAnimating = true
		const btn = document.getElementById('plinkoDropBtn')
		if (btn) btn.disabled = true
		addCurrency(-totalBet)
		updatePlinkoBalance()

		const setup = setupCanvas()
		if (!setup) { plinkoAnimating = false; if (btn) btn.disabled = false; return }
		drawBoard(setup)

		const mults = MULT_TABLES[plinkoRows]
		const colors = ['#ff3366', '#33aaff', '#ffcc00', '#44dd88', '#ff9900']

		// Pre-calculate results BEFORE animation — result never depends on rAF
		const results = []
		for (let b = 0; b < plinkoBallsCount; b++) {
			const path = []
			let pos = 0
			for (let row = 0; row < plinkoRows; row++) {
				const dir = Math.random() < 0.5 ? 0 : 1
				path.push(pos + dir)
				pos += dir
			}
			const bucketIdx = Math.min(pos, mults.length - 1)
			const mult = mults[bucketIdx]
			const win = Math.round(betPerBall * mult)
			results.push({ path, mult, win, color: colors[b % colors.length] })
		}

		const totalWin = results.reduce((s, r) => s + r.win, 0)
		const bestMult = results.reduce((m, r) => Math.max(m, r.mult), 0)
		const allMults = results.map(r => r.mult + 'x').join(' · ')

		// Play drop sound
		if (window.SND) try { window.SND.casinoSpin() } catch(e) {}

		// Animate balls (visual only)
		for (const res of results) {
			await animateBall(setup, res.path, res.color)
			if (results.length > 1) await new Promise(r => setTimeout(r, 100))
		}

		// Apply winnings
		addCurrency(totalWin)
		updatePlinkoBalance()

		// Play win/lose sound
		const net = totalWin - totalBet
		if (net > 0) {
			if (window._plinkoWin) try { window._plinkoWin.cloneNode().play() } catch(e) {}
			else if (window.SND) try { window.SND.casinoWin() } catch(e) {}
		} else if (net < 0) {
			if (window._plinkoLose) try { window._plinkoLose.cloneNode().play() } catch(e) {}
		}

		// Update stats
		plinkoStats.games += plinkoBallsCount
		if (net > 0) plinkoStats.won += net
		else plinkoStats.lost += Math.abs(net)
		if (bestMult > plinkoStats.maxMult) plinkoStats.maxMult = bestMult
		try { localStorage.setItem('plinkoStats', JSON.stringify(plinkoStats)) } catch(e) {}

		const sg = document.getElementById('plinkoTotalGames')
		const sw = document.getElementById('plinkoTotalWon')
		const sl = document.getElementById('plinkoTotalLost')
		const sm = document.getElementById('plinkoMaxMult')
		if (sg) sg.textContent = plinkoStats.games
		if (sw) sw.textContent = Math.round(plinkoStats.won)
		if (sl) sl.textContent = Math.round(plinkoStats.lost)
		if (sm) sm.textContent = plinkoStats.maxMult + 'x'

		if (net > 0)      showPlinkoMsg('🎉 ' + allMults + '  →  +' + net + ' монет!',      '#00ba7c', 'rgba(0,186,124,0.12)',   '#00ba7c')
		else if (net ===0) showPlinkoMsg('↩️ '  + allMults + '  →  Ничья!',                  '#71767b', 'rgba(113,118,123,0.1)', '#71767b')
		else               showPlinkoMsg('💸 '  + allMults + '  →  −' + Math.abs(net) + ' монет', '#f4212e', 'rgba(244,33,46,0.12)',   '#f4212e')

		plinkoAnimating = false
		if (btn) btn.disabled = false
		drawBoard(setup)
	}


	// Patch openCasinoGame for plinko
	const _origOpenPlinko = window.openCasinoGame
	window.openCasinoGame = function (gameName) {
		if (gameName === 'plinko') {
			document.getElementById('casinoMenu').style.display = 'none'
			document.getElementById('plinkoGame').style.display = 'block'
			updateCurrencyDisplay()
			updatePlinkoBalance()
			setTimeout(() => renderPlinkoBoard(), 50)
			return
		}
		_origOpenPlinko(gameName)
	}

	// Patch backToCasinoMenu
	const _origBackPlinko = window.backToCasinoMenu
	window.backToCasinoMenu = function () {
		document.getElementById('plinkoGame').style.display = 'none'
		_origBackPlinko()
	}
})()