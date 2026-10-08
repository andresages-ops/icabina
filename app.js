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
const downloadBtn = document.getElementById('download-btn');

// Pega tu Clave 1 de Azure aquí
const AZURE_KEY = 'FJHwRvWK3oeyFwzWkVGJA2tPRhTyGN7S8HEGo6eML5S3pGpvrMJmJQQJ99CJACYeBjFXJ3w3AAAbACOGdUVB';
const AZURE_REGION = 'eastus'; 
const AZURE_ENDPOINT = 'https://api.cognitive.microsofttranslator.com/translate?api-version=3.0&to=es&to=en';

const recognition = new webkitSpeechRecognition();
recognition.continuous = true;
recognition.interimResults = true;
recognition.lang = 'en-US'; 

let isListening = false;
let apagadoManual = false;
let pipWindowRef = null;
let indicatorTimeout = null;

// Control de tamaño de letra y tema
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

// Gestión de Memoria (Limpiar y Descargar)
clearBtn.addEventListener('click', () => {
  if(confirm("¿Estás seguro de limpiar toda la transcripción de la pantalla?")) {
    chatContainer.innerHTML = '';
    interimTextDisplay.innerHTML = '';
  }
});

downloadBtn.addEventListener('click', () => {
  const mensajes = document.querySelectorAll('.message');
  if (mensajes.length === 0) {
    alert("No hay texto para descargar.");
    return;
  }

  let contenido = "BITÁCORA DE TRADUCCIÓN - " + new Date().toLocaleString() + "\n";
  contenido += "========================================================\n\n";

  mensajes.forEach(msg => {
    const time = msg.querySelector('.timestamp').innerText;
    const orig = msg.querySelector('.original').innerText;
    const trans = msg.querySelector('.translation').innerText;
    contenido += `[${time}]\nOriginal: ${orig}\nTraducción: ${trans}\n\n`;
  });

  const blob = new Blob([contenido], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Bitacora_Cabina_${new Date().toISOString().slice(0,10)}.txt`;
  a.click();
  URL.revokeObjectURL(url);
});

// Resaltado de cifras
function resaltarDatosDuros(texto) {
  return texto.replace(/\b\d+([.,-]\d+)*\b/g, '<span class="highlight-data">$&</span>');
}

// Procesamiento de traducción
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
    let traduccionFinal = data[0].translations.find(t => t.to === idiomaObjetivo).text;
    
    traduccionFinal = resaltarDatosDuros(traduccionFinal);
    messageDiv.querySelector('.translation').innerHTML = traduccionFinal;
    chatContainer.scrollTop = chatContainer.scrollHeight;
  } catch (error) {
    messageDiv.querySelector('.translation').innerText = "Error de conexión.";
  }
}

// Transcripción en tiempo real e Indicador Visual
recognition.onresult = (event) => {
  let interimTranscript = '';
  
  // Hacer que el indicador parpadee en amarillo indicando que recibe voz
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
  }
}

recognition.onerror = (event) => {
  if (event.error === 'not-allowed') setListeningState(false);
};

recognition.onend = () => {
  if (isListening && !apagadoManual) {
    setTimeout(() => { try { recognition.start(); } catch(e) {} }, 250);
  } else {
    setListeningState(false);
  }
};

startBtn.addEventListener('click', () => {
  if (!isListening) {
    apagadoManual = false;
    try {
      recognition.start();
      setListeningState(true);
    } catch(e) {}
  } else {
    apagadoManual = true;
    recognition.stop();
    setListeningState(false);
  }
});

// Apertura y sincronización con la ventana flotante (Picture-in-Picture)
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