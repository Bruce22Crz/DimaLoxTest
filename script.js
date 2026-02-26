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

// ============================================================
// PLINKO
// ============================================================
var _plinkoRows = 8
var _plinkoBallsCount = 1
var _plinkoAnimating = false
var _plinkoStats = { games: 0, won: 0, lost: 0, maxMult: 0 }
try {
	var _ps = localStorage.getItem('plinkoStats')
	if (_ps) _plinkoStats = JSON.parse(_ps)
} catch (e) {}

// Sounds
;(function () {
	function mkA(b64) {
		try {
			var a = new Audio('data:audio/wav;base64,' + b64)
			a.load()
			return a
		} catch (e) {
			return null
		}
	}
	window._plinkoTick = mkA(
		'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',
	)
	window._plinkoWin = mkA(
		'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AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
	)
	window._plinkoLose = mkA(
		'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',
	)
})()

var _MULTS = {
	8: [8, 3, 1.2, 0.4, 0.2, 0.4, 1.2, 3, 8],
	12: [15, 5, 2, 0.8, 0.4, 0.2, 0.1, 0.2, 0.4, 0.8, 2, 5, 15],
	16: [50, 12, 5, 2, 0.8, 0.4, 0.2, 0.1, 0.1, 0.1, 0.2, 0.4, 0.8, 2, 5, 12, 50],
}

var _MCOLORS = {
	50: '#ff2244',
	15: '#ff4422',
	12: '#ff5500',
	8: '#ff7700',
	5: '#ffaa00',
	3: '#ffcc00',
	2: '#ccdd00',
	1.2: '#88bb00',
	0.8: '#4488cc',
	0.4: '#2255aa',
	0.2: '#1a3388',
	0.1: '#111155',
}

function _plinkoColor(m) {
	if (_MCOLORS[m]) return _MCOLORS[m]
	return m >= 5
		? '#ff7700'
		: m >= 1
			? '#88bb00'
			: m >= 0.4
				? '#2255aa'
				: '#111155'
}

function _plinkoSetup() {
	var canvas = document.getElementById('plinkoCanvas')
	if (!canvas) return null
	var mults = _MULTS[_plinkoRows]
	var cellW = Math.min(36, Math.floor(460 / (mults.length + 1)))
	var W = cellW * (mults.length + 1)
	var H = cellW * (_plinkoRows + 4)
	canvas.width = W
	canvas.height = H
	canvas.style.width = Math.min(W, 460) + 'px'
	canvas.style.height = Math.round((H * Math.min(W, 460)) / W) + 'px'
	return {
		canvas: canvas,
		ctx: canvas.getContext('2d'),
		W: W,
		H: H,
		cellW: cellW,
	}
}

function _plinkoDraw(setup, hi) {
	var ctx = setup.ctx,
		W = setup.W,
		H = setup.H,
		cellW = setup.cellW
	var mults = _MULTS[_plinkoRows]
	ctx.clearRect(0, 0, W, H)
	ctx.fillStyle = '#161616'
	ctx.fillRect(0, 0, W, H)

	// Pegs
	for (var row = 0; row < _plinkoRows; row++) {
		var n = row + 2,
			xs = (W - (n - 1) * cellW) / 2
		for (var col = 0; col < n; col++) {
			ctx.beginPath()
			ctx.arc(
				xs + col * cellW,
				cellW * 1.5 + row * cellW,
				cellW * 0.13,
				0,
				Math.PI * 2,
			)
			ctx.fillStyle = '#cccccc'
			ctx.fill()
		}
	}

	// Buckets
	var bh = Math.max(24, cellW * 0.78),
		by = H - bh - 3,
		slot = W / mults.length,
		gap = Math.max(2, slot * 0.07)
	mults.forEach(function (m, i) {
		var bx = i * slot + gap / 2,
			bw = slot - gap,
			hit = hi === i,
			color = _plinkoColor(m)
		ctx.globalAlpha = 0.9
		ctx.fillStyle = hit ? 'rgba(255,255,255,0.22)' : color + '30'
		ctx.beginPath()
		ctx.roundRect(bx, by, bw, bh, 4)
		ctx.fill()
		ctx.strokeStyle = hit ? '#fff' : color
		ctx.lineWidth = hit ? 2.5 : 1.5
		ctx.beginPath()
		ctx.roundRect(bx, by, bw, bh, 4)
		ctx.stroke()
		ctx.globalAlpha = 1
		var fs = Math.max(7, Math.min(13, bw * 0.35))
		ctx.fillStyle = hit ? '#fff' : color
		ctx.font = 'bold ' + fs + 'px Inter,sans-serif'
		ctx.textAlign = 'center'
		ctx.textBaseline = 'middle'
		ctx.fillText(m + 'x', bx + bw / 2, by + bh / 2)
	})
	ctx.textBaseline = 'alphabetic'
}

function _plinkoAnimate(setup, path, color) {
	return new Promise(function (resolve) {
		var ctx = setup.ctx,
			W = setup.W,
			cellW = setup.cellW
		var mults = _MULTS[_plinkoRows],
			r = cellW * 0.21
		var row = 0,
			ballPos = 0
		function step() {
			_plinkoDraw(setup)
			var n = row + 2,
				xs = (W - (n - 1) * cellW) / 2
			ctx.beginPath()
			ctx.arc(
				xs + ballPos * cellW,
				cellW * 1.5 + row * cellW,
				r,
				0,
				Math.PI * 2,
			)
			ctx.fillStyle = color
			ctx.shadowColor = color
			ctx.shadowBlur = 12
			ctx.fill()
			ctx.shadowBlur = 0
			ctx.strokeStyle = 'rgba(255,255,255,0.7)'
			ctx.lineWidth = 1.5
			ctx.stroke()
			if (window._plinkoTick)
				try {
					var s = window._plinkoTick.cloneNode()
					s.volume = 0.2
					s.play()
				} catch (e) {}
			if (path[row] !== undefined) ballPos = path[row]
			row++
			if (row > _plinkoRows) {
				var idx = Math.min(ballPos, mults.length - 1)
				_plinkoDraw(setup, idx)
				resolve(idx)
				return
			}
			setTimeout(step, 80)
		}
		setTimeout(step, 0)
	})
}

function _plinkoMsg(text, color, bg) {
	var el = document.getElementById('plinkoResult')
	if (!el) return
	clearTimeout(el._t)
	el.innerHTML = text
	el.style.cssText =
		'display:block;opacity:1;transform:none;margin:12px 0 0;padding:14px 18px;border-radius:12px;font-size:1.1rem;font-weight:700;text-align:center;transition:opacity 0.4s;color:' +
		color +
		';background:' +
		bg +
		';border:2px solid ' +
		color
	el._t = setTimeout(function () {
		el.style.opacity = '0'
		setTimeout(function () {
			el.style.display = 'none'
			el.innerHTML = ''
		}, 400)
	}, 4000)
}

function _plinkoUpdateBal() {
	var el = document.getElementById('plinkoBalance')
	if (el) el.textContent = Math.round(userCurrency)
	updateCurrencyDisplay()
	saveCurrencyToFirebase()
}

function _plinkoUpdateStats() {
	var s = _plinkoStats
	var sg = document.getElementById('plinkoTotalGames')
	var sw = document.getElementById('plinkoTotalWon')
	var sl = document.getElementById('plinkoTotalLost')
	var sm = document.getElementById('plinkoMaxMult')
	if (sg) sg.textContent = s.games
	if (sw) sw.textContent = Math.round(s.won)
	if (sl) sl.textContent = Math.round(s.lost)
	if (sm) sm.textContent = s.maxMult + 'x'
}

// Public functions (global, no IIFE scope issues)
window.setPlinkoRows = function (n, btn) {
	_plinkoRows = n
	document.querySelectorAll('[id^="plinkoRows"]').forEach(function (b) {
		b.style.background = ''
		b.style.color = ''
	})
	if (btn) {
		btn.style.background = '#1d9bf0'
		btn.style.color = '#fff'
	}
	var s = _plinkoSetup()
	if (s) _plinkoDraw(s)
}

window.setPlinkoBalls = function (n, btn) {
	_plinkoBallsCount = n
	document.querySelectorAll('[id^="plinkoBalls"]').forEach(function (b) {
		b.style.background = ''
		b.style.color = ''
	})
	if (btn) {
		btn.style.background = '#1d9bf0'
		btn.style.color = '#fff'
	}
}

window.setPlinkoBetPct = function (pct) {
	var inp = document.getElementById('plinkoBetInput')
	if (inp) inp.value = Math.max(1, Math.floor(userCurrency * pct))
}

window.dropPlinkoBalls = async function () {
	if (_plinkoAnimating) return
	if (!window.currentUser) {
		_plinkoMsg('❌ Войдите в аккаунт!', '#f4212e', 'rgba(244,33,46,0.12)')
		return
	}

	var inp = document.getElementById('plinkoBetInput')
	var betPerBall = Math.max(1, parseInt(inp && inp.value) || 10)
	var totalBet = betPerBall * _plinkoBallsCount
	if (userCurrency < totalBet) {
		_plinkoMsg(
			'❌ Недостаточно монет! Нужно ' + totalBet,
			'#f4212e',
			'rgba(244,33,46,0.12)',
		)
		return
	}

	_plinkoAnimating = true
	var btn = document.getElementById('plinkoDropBtn')
	if (btn) btn.disabled = true

	addCurrency(-totalBet)
	_plinkoUpdateBal()

	var setup = _plinkoSetup()
	if (!setup) {
		_plinkoAnimating = false
		if (btn) btn.disabled = false
		return
	}
	_plinkoDraw(setup)

	var mults = _MULTS[_plinkoRows]
	var colors = ['#ff3366', '#33aaff', '#ffcc00', '#44dd88', '#ff9900']
	var results = []

	for (var b = 0; b < _plinkoBallsCount; b++) {
		var path = [],
			pos = 0
		for (var row = 0; row < _plinkoRows; row++) {
			var dir = Math.random() < 0.5 ? 0 : 1
			path.push(pos + dir)
			pos += dir
		}
		var idx = Math.min(pos, mults.length - 1)
		var mult = mults[idx]
		results.push({
			path: path,
			mult: mult,
			win: Math.round(betPerBall * mult),
			color: colors[b % colors.length],
		})
	}

	var totalWin = results.reduce(function (s, r) {
		return s + r.win
	}, 0)
	var bestMult = results.reduce(function (m, r) {
		return Math.max(m, r.mult)
	}, 0)
	var allMults = results
		.map(function (r) {
			return r.mult + 'x'
		})
		.join(' · ')

	for (var i = 0; i < results.length; i++) {
		await _plinkoAnimate(setup, results[i].path, results[i].color)
		if (results.length > 1)
			await new Promise(function (r) {
				setTimeout(r, 80)
			})
	}

	addCurrency(totalWin)
	_plinkoUpdateBal()

	var net = totalWin - totalBet
	if (net > 0 && window._plinkoWin)
		try {
			window._plinkoWin.cloneNode().play()
		} catch (e) {}
	if (net < 0 && window._plinkoLose)
		try {
			window._plinkoLose.cloneNode().play()
		} catch (e) {}

	_plinkoStats.games += _plinkoBallsCount
	if (net > 0) _plinkoStats.won += net
	else _plinkoStats.lost += Math.abs(net)
	if (bestMult > _plinkoStats.maxMult) _plinkoStats.maxMult = bestMult
	try {
		localStorage.setItem('plinkoStats', JSON.stringify(_plinkoStats))
	} catch (e) {}
	_plinkoUpdateStats()

	if (net > 0)
		_plinkoMsg(
			'🎉 ' + allMults + '  →  +' + net + ' монет!',
			'#00ba7c',
			'rgba(0,186,124,0.12)',
		)
	else if (net === 0)
		_plinkoMsg(
			'↩️ ' + allMults + '  →  Ничья!',
			'#71767b',
			'rgba(113,118,123,0.1)',
		)
	else
		_plinkoMsg(
			'💸 ' + allMults + '  →  −' + Math.abs(net) + ' монет',
			'#f4212e',
			'rgba(244,33,46,0.12)',
		)

	_plinkoAnimating = false
	if (btn) btn.disabled = false
	_plinkoDraw(setup)
}

// Hook openCasinoGame
;(function () {
	var _orig = window.openCasinoGame
	window.openCasinoGame = function (gameName) {
		if (gameName === 'plinko') {
			document.querySelectorAll('.casino-game').forEach(function (g) {
				g.style.display = 'none'
			})
			document.getElementById('casinoMenu').style.display = 'none'
			document.getElementById('plinkoGame').style.display = 'block'
			_plinkoUpdateBal()
			_plinkoUpdateStats()
			setTimeout(function () {
				var s = _plinkoSetup()
				if (s) _plinkoDraw(s)
			}, 60)
			return
		}
		_orig(gameName)
	}
	var _origBack = window.backToCasinoMenu
	window.backToCasinoMenu = function () {
		document.getElementById('plinkoGame').style.display = 'none'
		_origBack()
	}
})()
