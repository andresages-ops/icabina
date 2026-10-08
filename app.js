const startBtn = document.getElementById('start-btn');
const pipBtn = document.getElementById('pip-btn');
const chatContainer = document.getElementById('chat-container');
const interimTextDisplay = document.getElementById('interim-text');
const pipContent = document.getElementById('pip-content');

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

// Resalta números y fechas
function resaltarDatosDuros(texto) {
  return texto.replace(/\b\d+([.,-]\d+)*\b/g, '<span class="highlight-data">$&</span>');
}

// Envío a Azure sin temporizador (Traducción instantánea)
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
    messageDiv.querySelector('.translation').innerText = "Error de conexión con Azure.";
  }
}

// Escucha directa, cero retraso
recognition.onresult = (event) => {
  let interimTranscript = '';
  
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
  if (event.error === 'not-allowed') {
    isListening = false;
    startBtn.textContent = "Iniciar Escucha";
    startBtn.style.background = "#0b57d0";
  }
};

recognition.onend = () => {
  if (isListening && !apagadoManual) {
    setTimeout(() => { try { recognition.start(); } catch(e) {} }, 250);
  } else {
    isListening = false;
    startBtn.textContent = "Iniciar Escucha";
    startBtn.style.background = "#0b57d0";
  }
};

startBtn.addEventListener('click', () => {
  if (!isListening) {
    apagadoManual = false;
    isListening = true;
    try {
      recognition.start();
      startBtn.textContent = "Detener Escucha";
      startBtn.style.background = "#b31412";
    } catch(e) {}
  } else {
    apagadoManual = true;
    isListening = false;
    recognition.stop();
    startBtn.textContent = "Iniciar Escucha";
    startBtn.style.background = "#0b57d0";
  }
});

// Modo Flotante (Lleva consigo todo el bloque)
pipBtn.addEventListener('click', async () => {
  if (!('documentPictureInPicture' in window)) {
    alert("Tu navegador no soporta el modo flotante. Usa la versión más reciente de Chrome.");
    return;
  }
  
  try {
    const pipWindow = await documentPictureInPicture.requestWindow({
      width: 450,
      height: 650
    });
    
    [...document.styleSheets].forEach((styleSheet) => {
      try {
        const cssRules = [...styleSheet.cssRules].map((rule) => rule.cssText).join('');
        const style = document.createElement('style');
        style.textContent = cssRules;
        pipWindow.document.head.appendChild(style);
      } catch (e) {}
    });
    
    // Movemos el botón, el chat y el texto en tiempo real
    pipWindow.document.body.appendChild(pipContent);
    
    // Cuando se cierre la ventana, devolvemos todo a su lugar original
    pipWindow.addEventListener("pagehide", () => {
      document.body.appendChild(pipContent);
    });
    
  } catch (error) {
    console.error("Error al abrir ventana flotante:", error);
  }
});