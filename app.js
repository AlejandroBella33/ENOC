// =========================================================
// CONSTANTES DEL CONTRATO Y DEX
// =========================================================
const CONTRACT = "0xab8DF9213d13a3cDe984A83129e6acDaCBA78633"; // ⚠️ REEMPLAZAR AQUÍ CON LA DIRECCIÓN FINAL DE ENOCV2
const USDT = "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174";
const ENOC = CONTRACT;
const QUICKSWAP_ROUTER = "0xa5E0829CaCEd8fFDD4De3c43696c57F7D7A678ff"; 
const POLYGON_RPC = "https://polygon-rpc.com";
const CHAIN_ID = 137; // Polygon Mainnet

const quickswapURL = `https://quickswap.exchange/#/swap?outputCurrency=${ENOC}&inputCurrency=${USDT}`;

// =========================================================
// ABIs
// =========================================================
const ERC20_ABI = [
    {"constant":false,"inputs":[{"name":"_spender","type":"address"},{"name":"_value","type":"uint256"}],"name":"approve","outputs":[{"name":"","type":"bool"}],"type":"function"},
    {"constant":true,"inputs":[{"name":"_owner","type":"address"},{"name":"_spender","type":"address"}],"name":"allowance","outputs":[{"name":"","type":"uint256"}],"type":"function"},
    {"constant":true,"inputs":[{"name":"_owner","type":"address"}],"name":"balanceOf","outputs":[{"name":"","type":"uint256"}],"type":"function"},
    {"constant":true,"inputs":[],"name":"decimals","outputs":[{"name":"","type":"uint8"}],"type":"function"}
];

const ROUTER_ABI = [
    {
        "name": "swapExactTokensForTokensSupportingFeeOnTransferTokens",
        "type": "function",
        "inputs": [
            { "type": "uint256", "name": "amountIn" },
            { "type": "uint256", "name": "amountOutMin" },
            { "type": "address[]", "name": "path" },
            { "type": "address", "name": "to" },
            { "type": "uint256", "name": "deadline" }
        ],
        "outputs": [],
        "stateMutability": "nonpayable"
    }
];

// =========================================================
// STATE & UI references
// =========================================================
let web3Modal;
let provider;
let web3;
let selectedAccount;

const statusText = document.getElementById("statusText");
const notConnectedPanel = document.getElementById("notConnectedPanel");
const connectedPanel = document.getElementById("connectedPanel");
const accountEl = document.getElementById("account");
const chainEl = document.getElementById("chain");

function setStatus(msg) {
    if (statusText) statusText.innerText = msg;
}

function updateUI(account, chainId) {
    if (accountEl) accountEl.innerText = account || "";
    if (chainEl) chainEl.innerText = chainId || "";
    if (notConnectedPanel) notConnectedPanel.style.display = "none";
    if (connectedPanel) connectedPanel.style.display = "block";
}

function resetUI() {
    if (accountEl) accountEl.innerText = "";
    if (chainEl) chainEl.innerText = "";
    if (statusText) statusText.innerText = "Desconectado";
    if (notConnectedPanel) notConnectedPanel.style.display = "block";
    if (connectedPanel) connectedPanel.style.display = "none";
}

// =========================================================
// INIT WEB3Modal
// =========================================================
function initWeb3Modal() {
    try {
        const providerOptions = {
            walletconnect: {
                package: window.WalletConnectProvider.default,
                options: {
                    rpc: { [CHAIN_ID]: POLYGON_RPC },
                    network: "polygon",
                    // Esto es crucial para que el modal funcione correctamente y genere el QR/DeepLink
                }
            },
            // Se detectarán automáticamente billeteras inyectadas (ej. MetaMask Desktop)
        };
        
        web3Modal = new window.Web3Modal.default({ 
            cacheProvider: true, // Mantener la conexión si el usuario actualiza
            providerOptions, 
            theme: "dark" 
        });

    } catch (e) {
        console.warn("initWeb3Modal error:", e);
        setStatus("Error: Web3Modal no pudo inicializarse.");
    }
}

// =========================================================
// CONEXIÓN
// =========================================================
async function onConnect() {
    if (!web3Modal) {
        setStatus("Error: Web3Modal no inicializado.");
        return;
    }

    setStatus("Abriendo selector de wallets...");

    try {
        // Al llamar a connect(), el modal se abre.
        // Si el usuario selecciona WalletConnect, el modal genera el QR / Deep Link.
        // Si el usuario acepta en la wallet, el control vuelve aquí.
        provider = await web3Modal.connect(); 
        
        web3 = new window.Web3(provider);
        subscribeProvider(provider);
        
        const accounts = await web3.eth.getAccounts();
        selectedAccount = accounts[0];
        const chainId = await web3.eth.getChainId();

        updateUI(selectedAccount, chainId);
        setStatus("Conectado");

        // ⚠️ Si la red no es Polygon (137), intenta solicitar el cambio
        if (Number(chainId) !== CHAIN_ID) {
            try {
                // Intenta cambiar la red a Polygon (0x89 es el hex de 137)
                await provider.request({ 
                    method: "wallet_switchEthereumChain", 
                    params: [{ chainId: "0x89" }] 
                });
                const newChain = await web3.eth.getChainId();
                chainEl.innerText = newChain;
                setStatus("Red cambiada a Polygon.");
            } catch (switchError) {
                setStatus("Conectado (red incorrecta). Cambia a Polygon en tu wallet.");
            }
        }

    } catch (e) {
        // Este catch se ejecuta si el usuario cancela la conexión en el modal o hay un error.
        console.error("Conexión cancelada o fallida:", e);
        setStatus("Conexión cancelada.");
        // Limpiamos la caché para evitar que intente reconectar a un proveedor fallido
        try { await web3Modal.clearCachedProvider(); } catch (e) { /* ignore */ }
    }
}

// =========================================================
// SUBSCRIPTIONS / DISCONNECT
// =========================================================
function subscribeProvider(providerObj) {
    if (!providerObj || !providerObj.on) return;
    
    // Este evento se dispara después de que la wallet confirma la conexión.
    providerObj.on("accountsChanged", (accounts) => {
        selectedAccount = accounts && accounts[0];
        if (accountEl) accountEl.innerText = selectedAccount || "";
        // Re-evaluar la UI si la cuenta cambia
        if(selectedAccount) updateUI(selectedAccount, chainEl.innerText);
    });
    
    providerObj.on("chainChanged", (chainId) => {
        let c = chainId;
        if (typeof chainId === "string" && chainId.startsWith("0x")) c = parseInt(chainId, 16);
        if (chainEl) chainEl.innerText = c;
    });
    
    providerObj.on("disconnect", (err) => {
        console.log("disconnect", err);
        onDisconnect();
    });
}

async function onDisconnect() {
    if (provider && provider.close) {
        try { await provider.close(); } catch (e) { /* ignore */ } // Cierra la sesión de WalletConnect
    }
    if (web3Modal && web3Modal.clearCachedProvider) {
        try { await web3Modal.clearCachedProvider(); } catch (e) { /* ignore */ } // Limpia la caché local
    }
    provider = null;
    web3 = null;
    selectedAccount = null;
    resetUI();
}

// =========================================================
// SWAP (Lógica de Compra)
// =========================================================
async function buyENOC() {
    if (!web3 || !selectedAccount) {
        alert("Primero conecta tu wallet.");
        return;
    }
    const amountInput = document.getElementById("amountUSDT").value;
    if (!amountInput || Number(amountInput) <= 0) {
        alert("Ingresa una cantidad válida de USDT.");
        return;
    }
    try {
        setStatus("Preparando swap...");
        
        // 1. Obtener decimales de USDT (se asume 6)
        const usdtContract = new web3.eth.Contract(ERC20_ABI, USDT);
        let usdtDecimals = 6;
        try { usdtDecimals = Number(await usdtContract.methods.decimals().call()); } catch (e) {}
        
        const multiplier = Math.pow(10, usdtDecimals);
        const amountInBN = web3.utils.toBN(String(Math.floor(Number(amountInput) * multiplier)));
        if (amountInBN.lte(web3.utils.toBN(0))) { alert("Monto muy pequeño."); return; }

        // 2. Comprobar y aprobar Allowance
        const allowance = web3.utils.toBN(await usdtContract.methods.allowance(selectedAccount, QUICKSWAP_ROUTER).call());
        if (allowance.lt(amountInBN)) {
            setStatus("Aprobando USDT al router...");
            await usdtContract.methods.approve(QUICKSWAP_ROUTER, amountInBN.toString()).send({ from: selectedAccount });
        }

        // 3. Ejecutar Swap
        setStatus("Ejecutando swap...");
        const router = new web3.eth.Contract(ROUTER_ABI, QUICKSWAP_ROUTER);
        const path = [USDT, ENOC];
        const deadline = Math.floor(Date.now() / 1000) + (60 * 10);
        const amountOutMin = 0; 

        await router.methods.swapExactTokensForTokensSupportingFeeOnTransferTokens(
            amountInBN.toString(),
            amountOutMin,
            path,
            selectedAccount,
            deadline
        ).send({ from: selectedAccount, gas: 800000 });

        setStatus("Swap enviado. Revisa tu wallet / Polygonscan.");
    } catch (err) {
        console.error("swap error:", err);
        setStatus("Error en la transacción.");
        alert("Error en la transacción. Verifica si excedes los límites del contrato.");
    }
}


// =========================================================
// INICIALIZACIÓN Y EVENTOS
// =========================================================
// ⚠️ Nota: la función btnAddLiquidity es solo un placeholder, si no la necesita, puede borrarla
document.getElementById("btnConnect").addEventListener("click", onConnect);
document.getElementById("btnDisconnect").addEventListener("click", onDisconnect);
document.getElementById("btnBuy").addEventListener("click", buyENOC);
document.getElementById("btnAddLiquidity").addEventListener("click", () => alert("Función de Añadir Liquidez es una demo de administración.")); 

window.addEventListener("load", () => {
    initWeb3Modal();
    setStatus("Listo. Pulsa 'Conectar Wallet'.");
    // Intento de auto-conexión si hay proveedor en caché
    if (web3Modal && web3Modal.cachedProvider) {
        setTimeout(()=> onConnect(), 300); 
    }
});
