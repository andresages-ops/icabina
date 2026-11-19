const startBtn = document.getElementById('start-btn');
const startText = document.getElementById('start-text');
const audioIndicator = document.getElementById('audio-indicator');
const pipBtn = document.getElementById('pip-btn');
const chatContainer = document.getElementById('chat-container');
const interimTextDisplay = document.getElementById('interim-text');
const pipContent = document.getElementById('pip-content');
const fontIncBtn = document.getElementById('font-inc');
const fontDecBtn = document.getElementById('font-dec');
const themeBtn = document.getElementById('theme-btn');
const clearBtn = document.getElementById('clear-btn');

// Pega tu Clave 1 de Azure aquí
const AZURE_KEY = 'FJHwRvWK3oeyFwzWkVGJA2tPRhTyGN7S8HEGo6eML5S3pGpvrMJmJQQJ99CJACYeBjFXJ3w3AAAbACOGdUVB';
const AZURE_REGION = 'eastus'; 
const AZURE_ENDPOINT = 'https://api.cognitive.microsofttranslator.com/translate?api-version=3.0&to=es&to=en';

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

let recognition = null;
let isListening = false;
let apagadoManual = false;
let restartTimeout = null;
let watchdogInterval = null;
let lastActivityTime = Date.now();
let pipWindowRef = null;
let indicatorTimeout = null;

let currentFontSize = 16;
let isDarkMode = false;

function actualizarTamanoLetra(nuevoTamano) {
  currentFontSize = Math.max(12, Math.min(30, nuevoTamano));
  document.documentElement.style.setProperty('--base-font-size', currentFontSize + 'px');
  if (pipWindowRef) {
    pipWindowRef.document.documentElement.style.setProperty('--base-font-size', currentFontSize + 'px');
  }
}

fontIncBtn.addEventListener('click', () => actualizarTamanoLetra(currentFontSize + 2));
fontDecBtn.addEventListener('click', () => actualizarTamanoLetra(currentFontSize - 2));

themeBtn.addEventListener('click', () => {
  isDarkMode = !isDarkMode;
  document.body.classList.toggle('dark-theme', isDarkMode);
  themeBtn.textContent = isDarkMode ? '☀️' : '🌙';
  if (pipWindowRef) {
    pipWindowRef.document.body.classList.toggle('dark-theme', isDarkMode);
  }
});

clearBtn.addEventListener('click', () => {
  if (confirm("¿Estás seguro de limpiar toda la transcripción de la pantalla?")) {
    chatContainer.innerHTML = '';
    interimTextDisplay.innerHTML = '';
  }
});

function resaltarDatosDuros(texto) {
  return texto.replace(/\b\d+([.,-]\d+)*\b/g, '<span class="highlight-data">$&</span>');
}

async function procesarTraduccion(textoOriginal) {
  if (!textoOriginal.trim()) return;

  const now = new Date();
  const timeString = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const textoOriginalResaltado = resaltarDatosDuros(textoOriginal);

  const messageDiv = document.createElement('div');
  messageDiv.className = 'message';
  
  messageDiv.innerHTML = `
    <div class="timestamp">${timeString}</div>
    <div class="original">${textoOriginalResaltado}</div>
    <div class="translation">Traduciendo...</div>
  `;
  chatContainer.appendChild(messageDiv);
  chatContainer.scrollTop = chatContainer.scrollHeight;

  try {
    const response = await fetch(AZURE_ENDPOINT, {
      method: 'POST',
      headers: {
        'Ocp-Apim-Subscription-Key': AZURE_KEY,
        'Ocp-Apim-Subscription-Region': AZURE_REGION,
        'Content-type': 'application/json'
      },
      body: JSON.stringify([{ text: textoOriginal }])
    });
    const data = await response.json();
    
    const idiomaDetectado = data[0].detectedLanguage.language;
    const idiomaObjetivo = (idiomaDetectado === 'es') ? 'en' : 'es';
    
    if (idiomaDetectado === 'es') {
      messageDiv.classList.add('es-en');
    }

    let traduccionFinal = data[0].translations.find(t => t.to === idiomaObjetivo).text;
    traduccionFinal = resaltarDatosDuros(traduccionFinal);
    messageDiv.querySelector('.translation').innerHTML = traduccionFinal;
    chatContainer.scrollTop = chatContainer.scrollHeight;
  } catch (error) {
    messageDiv.querySelector('.translation').innerText = "Error de conexión.";
  }
}

function setListeningState(listening) {
  isListening = listening;
  if (listening) {
    startText.textContent = "Detener Escucha";
    startBtn.style.backgroundColor = "#b31412";
    audioIndicator.className = "indicator active";
  } else {
    startText.textContent = "Iniciar Escucha";
    startBtn.style.backgroundColor = "";
    audioIndicator.className = "indicator";
    interimTextDisplay.innerHTML = '';
  }
}

// Vigila que Chrome no se quede "zombi" en silencio o con texto congelado
function iniciarVigilancia() {
  clearInterval(watchdogInterval);
  lastActivityTime = Date.now();

  watchdogInterval = setInterval(() => {
    if (!isListening || apagadoManual) return;

    const tiempoSinActividad = Date.now() - lastActivityTime;
    // Si pasan 10 segundos sin actividad o con una frase atorada, reinicia en silencio
    if (tiempoSinActividad > 10000) {
      iniciarMotorVoz();
    }
  }, 2500);
}

function iniciarMotorVoz() {
  clearTimeout(restartTimeout);
  lastActivityTime = Date.now();

  if (recognition) {
    recognition.onstart = null;
    recognition.onsoundstart = null;
    recognition.onspeechstart = null;
    recognition.onresult = null;
    recognition.onerror = null;
    recognition.onend = null;
    try { recognition.abort(); } catch (e) {}
    recognition = null;
  }

  recognition = new SpeechRecognition();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = 'en-US';

  recognition.onstart = () => { lastActivityTime = Date.now(); };
  recognition.onsoundstart = () => { lastActivityTime = Date.now(); };
  recognition.onspeechstart = () => { lastActivityTime = Date.now(); };

  recognition.onresult = (event) => {
    lastActivityTime = Date.now();
    let interimTranscript = '';
    
    audioIndicator.classList.add('receiving');
    clearTimeout(indicatorTimeout);
    indicatorTimeout = setTimeout(() => {
      audioIndicator.classList.remove('receiving');
    }, 500);
    
    for (let i = event.resultIndex; i < event.results.length; ++i) {
      if (event.results[i].isFinal) {
        const textoOriginal = event.results[i][0].transcript.trim();
        interimTextDisplay.innerHTML = ''; 
        procesarTraduccion(textoOriginal);
      } else {
        interimTranscript += event.results[i][0].transcript;
      }
    }
    
    if (interimTranscript !== '') {
      interimTextDisplay.innerHTML = interimTranscript;
    }
  };

  recognition.onerror = (event) => {
    if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
      apagadoManual = true;
      clearInterval(watchdogInterval);
      setListeningState(false);
    }
  };

  recognition.onend = () => {
    if (isListening && !apagadoManual) {
      restartTimeout = setTimeout(() => {
        if (isListening && !apagadoManual) {
          iniciarMotorVoz();
        }
      }, 250);
    } else {
      setListeningState(false);
    }
  };

  try {
    recognition.start();
    setListeningState(true);
  } catch (e) {
    restartTimeout = setTimeout(() => {
      if (isListening && !apagadoManual) iniciarMotorVoz();
    }, 400);
  }
}

function detenerMotorVoz() {
  apagadoManual = true;
  clearTimeout(restartTimeout);
  clearInterval(watchdogInterval);
  setListeningState(false);

  if (recognition) {
    recognition.onstart = null;
    recognition.onsoundstart = null;
    recognition.onspeechstart = null;
    recognition.onresult = null;
    recognition.onerror = null;
    recognition.onend = null;
    try { recognition.abort(); } catch (e) {}
    recognition = null;
  }
}

startBtn.addEventListener('click', () => {
  if (!isListening) {
    apagadoManual = false;
    iniciarMotorVoz();
    iniciarVigilancia();
  } else {
    detenerMotorVoz();
  }
});

pipBtn.addEventListener('click', async () => {
  if (!('documentPictureInPicture' in window)) {
    alert("Tu navegador no soporta el modo flotante. Usa la versión más reciente de Google Chrome.");
    return;
  }
  
  try {
    const pipWindow = await documentPictureInPicture.requestWindow({ width: 440, height: 620 });
    pipWindowRef = pipWindow;
    
    [...document.styleSheets].forEach((styleSheet) => {
      try {
        const cssRules = [...styleSheet.cssRules].map((rule) => rule.cssText).join('');
        const style = document.createElement('style');
        style.textContent = cssRules;
        pipWindow.document.head.appendChild(style);
      } catch (e) {}
    });
    
    pipWindow.document.documentElement.style.setProperty('--base-font-size', currentFontSize + 'px');
    if (isDarkMode) pipWindow.document.body.classList.add('dark-theme');
    
    pipWindow.document.body.appendChild(pipContent);
    
    pipWindow.addEventListener("pagehide", () => {
      document.body.appendChild(pipContent);
      pipWindowRef = null;
    });
    
  } catch (error) {
    console.error("Error al abrir ventana flotante:", error);
  }
});