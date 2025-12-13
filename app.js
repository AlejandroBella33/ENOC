/* ENOC Mini-App v2 — app.js
   Universal connection: MetaMask injected + WalletConnect via Web3Modal
   Ready for GitHub Pages (public hosting)
*/

const CONFIG = {
  enocAddress: "0xab8DF9213d13a3cDe984A83129e6acDaCBA78633", // ⚠️ Recuerde reemplazar con la nueva dirección de ENOCv2
  usdtAddress: "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174",
  routerAddress: "0xa5E0829CaCEd8fFDD4De3c43696c57F7D7A678ff", // QuickSwap Router
  polygonRpc: "https://polygon-rpc.com", // WalletConnect RPC
  desiredChainId: 137 // Polygon mainnet chainId
};

// minimal router ABI for swapExactTokensForTokens
const routerABI = [
  {"inputs":[{"internalType":"uint256","name":"amountIn","type":"uint256"},{"internalType":"uint256","name":"amountOutMin","type":"uint256"},{"internalType":"address[]","name":"path","type":"address[]"},{"internalType":"address","name":"to","type":"address"},{"internalType":"uint256","name":"deadline","type":"uint256"}],"name":"swapExactTokensForTokens","outputs":[{"internalType":"uint256[]","name":"amounts","type":"uint256[]"}],"stateMutability":"nonpayable","type":"function"}
];

// minimal ERC20 approve ABI
const erc20ABI = [
  {"constant":false,"inputs":[{"name":"spender","type":"address"},{"name":"value","type":"uint256"}],"name":"approve","outputs":[{"name":"","type":"bool"}],"type":"function"},
  {"constant":true,"inputs":[{"name":"owner","type":"address"},{"name":"spender","type":"address"}],"name":"allowance","outputs":[{"name":"","type":"uint256"}],"type":"function"}, // Se añade allowance para una mejor UX
  {"constant":true,"inputs":[{"name":"owner","type":"address"}],"name":"balanceOf","outputs":[{"name":"balance","type":"uint256"}],"type":"function"}
];

// UI references
const btnConnect = document.getElementById("btnConnect");
const btnDisconnect = document.getElementById("btnDisconnect");
const connectedPanel = document.getElementById("connectedPanel");
const accountEl = document.getElementById("account");
const chainEl = document.getElementById("chain");
const statusText = document.getElementById("statusText");
const btnBuy = document.getElementById("btnBuy");

let web3Modal, providerInstance, web3, currentAccount;

// Init Web3Modal
function initWeb3Modal() {
  const providerOptions = {
    walletconnect: {
      package: window.WalletConnectProvider.default,
      options: {
        rpc: {
          [CONFIG.desiredChainId]: CONFIG.polygonRpc
        },
        // Usar chainId de Polygon para la solicitud inicial de WC
        chainId: CONFIG.desiredChainId 
      }
    }
  };

  web3Modal = new window.Web3Modal.default({
    // Se recomienda 'true' en producción para auto-conectar, pero lo dejamos en 'false' según su original.
    cacheProvider: false, 
    providerOptions
  });
}

// utilities
function setStatus(msg) { statusText.innerText = msg; }
function showConnected(address, chainId) {
  connectedPanel.style.display = "block";
  accountEl.innerText = address;
  chainEl.innerText = chainId;
  document.getElementById("notConnectedPanel").style.display = "none";
  btnDisconnect.style.display = "inline-block";
  btnConnect.style.display = "none";
}

// connect (universal)
async function connectWallet() {
  try {
    setStatus("Conectando wallet...");
    
    // open modal (handles injected wallets and walletconnect)
    providerInstance = await web3Modal.connect();
    
    // create web3 instance
    web3 = new Web3(providerInstance);
    
    // get accounts
    const accounts = await web3.eth.getAccounts();
    currentAccount = accounts[0];
    
    // chain id as number
    let chainId = await web3.eth.getChainId();
    
    // 1. Mostrar estado de conexión
    showConnected(currentAccount, chainId);
    setStatus("Conectado en chain " + chainId);

    // 2. Lógica agregada: Intentar forzar el cambio/confirmación a Polygon (137)
    // Esto es el "despertador" que obliga a la wallet a procesar la URI de emparejamiento.
    if (Number(chainId) !== CONFIG.desiredChainId && providerInstance.request) {
        try {
            setStatus("Solicitando cambio de red a Polygon...");
            await providerInstance.request({
                method: "wallet_switchEthereumChain",
                params: [{ chainId: "0x89" }] // 0x89 es 137 en hexadecimal
            });
            // Una vez que el usuario confirma el cambio, actualizamos el chainId
            chainId = await web3.eth.getChainId();
            chainEl.innerText = chainId;
            setStatus("Red Polygon configurada. Listo para operar.");
        } catch (switchError) {
            // El usuario canceló o la billetera no permite el switch programático
            setStatus("Por favor cambie la red a Polygon (137) en su wallet.");
        }
    } else {
        setStatus("Red Polygon detectada. Listo para operar.");
    }
    
    // events (Se mantienen las funciones originales de la billetera)
    if (providerInstance.on) {
      providerInstance.on("accountsChanged", (accounts) => {
        currentAccount = accounts[0];
        accountEl.innerText = currentAccount;
      });
      providerInstance.on("chainChanged", (chainIdHex) => {
        // web3Modal walletconnect may pass number or hex; coerce to number
        const normalized = (typeof chainIdHex === "string" && chainIdHex.startsWith("0x")) ? parseInt(chainIdHex, 16) : Number(chainIdHex);
        chainEl.innerText = normalized;
        if (normalized !== CONFIG.desiredChainId) {
          setStatus("Cambio de red detectado. Cambia a Polygon (chainId 137).");
        } else {
          setStatus("Red Polygon detectada.");
        }
      });
      providerInstance.on("disconnect", (code, reason) => {
        disconnectWallet();
      });
    }

  } catch (err) {
    console.error("connectWallet error", err);
    // Limpiamos la caché de web3Modal si la conexión falla para evitar errores futuros
    try { await web3Modal.clearCachedProvider(); } catch (e) { /* ignore */ }
    setStatus("No se pudo conectar la wallet. Intente de nuevo.");
  }
}

async function disconnectWallet() {
  try {
    if (providerInstance && providerInstance.close) {
      await providerInstance.close(); // Cierra la sesión de WalletConnect
    }
    // Aseguramos la limpieza de la caché de Web3Modal para una desconexión completa
    if (web3Modal && web3Modal.clearCachedProvider) {
        await web3Modal.clearCachedProvider();
    }
  } catch (e) { /* ignore */ }
  currentAccount = null;
  web3 = null;
  providerInstance = null;
  connectedPanel.style.display = "none";
  document.getElementById("notConnectedPanel").style.display = "block";
  btnConnect.style.display = "inline-block";
  btnDisconnect.style.display = "none";
  setStatus("Desconectado");
}

// BUY function (USDT -> ENOC)
async function buyENOC() {
  if (!web3 || !currentAccount) {
    alert("Conecta tu wallet primero.");
    return;
  }
  if (Number(await web3.eth.getChainId()) !== CONFIG.desiredChainId) {
     alert("Debes estar conectado a la red Polygon (137) para comprar ENOC.");
     return;
  }

  const raw = document.getElementById("amountUSDT").value;
  if (!raw || isNaN(raw) || Number(raw) <= 0) {
    alert("Ingresa una cantidad válida.");
    return;
  }

  const amountUSDT = raw.toString();
  setStatus("Preparando transacción...");

  try {
    // router & contracts
    const router = new web3.eth.Contract(routerABI, CONFIG.routerAddress);
    const usdt = new web3.eth.Contract(erc20ABI, CONFIG.usdtAddress);

    // Convert USDT to 6-decimals format (mwei => 10^6, que es lo que usa USDT en Polygon)
    const amountIn = web3.utils.toWei(amountUSDT, "mwei"); 
    
    // ⚠️ REVISIÓN: Comprobar Allowance antes de aprobar
    const allowance = await usdt.methods.allowance(currentAccount, CONFIG.routerAddress).call();
    if (web3.utils.toBN(allowance).lt(web3.utils.toBN(amountIn))) {
        // Approve router to spend USDT
        setStatus("Solicitando aprobación USDT...");
        await usdt.methods.approve(CONFIG.routerAddress, amountIn).send({ from: currentAccount });
        setStatus("Aprobación confirmada. Ejecutando swap...");
    } else {
        setStatus("Allowance ya existe. Ejecutando swap...");
    }

    // Deadline 2 minutes ahead
    const deadline = Math.floor(Date.now() / 1000) + 120;

    // Swap: USDT -> ENOC
    // Se usa swapExactTokensForTokens (NO recomendado para tokens con fees)
    // ⚠️ AVISO DE RIESGO: Este método (swapExactTokensForTokens) podría fallar si ENOCv2 cobra fees de transferencia/venta. 
    // Para tokens con fees, el ABI debe usar 'swapExactTokensForTokensSupportingFeeOnTransferTokens'.
    // Si la compra falla, cambie el ABI del router por el que soporta fees.
    const swapTx = await router.methods.swapExactTokensForTokens(
      amountIn,
      0, // amountOutMin set to 0 for demo (DEBE ser calculado para evitar slippage/frontrun)
      [CONFIG.usdtAddress, CONFIG.enocAddress],
      currentAccount,
      deadline
    ).send({ from: currentAccount });

    console.log("swapTx", swapTx);
    setStatus("Swap realizado. Revisa tu wallet.");
  } catch (err) {
    console.error("buyENOC error", err);
    setStatus("Error en la transacción. Revisa consola/wallet.");
    alert("Error: " + (err.message || err));
  }
}

// wire UI
btnConnect.addEventListener("click", connectWallet);
btnDisconnect.addEventListener("click", disconnectWallet);
btnBuy.addEventListener("click", buyENOC);

// initialize
initWeb3Modal();

setStatus("Listo. Pulsa 'Conectar Wallet' para empezar.");
