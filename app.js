const startBtn = document.getElementById('start-btn');
const pipBtn = document.getElementById('pip-btn');
const chatContainer = document.getElementById('chat-container');
const interimTextDisplay = document.getElementById('interim-text');

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

// Variables para el agrupamiento inteligente (Buffer)
let textBuffer = '';
let bufferTimeout = null;

// Función para resaltar números, fechas y montos
function resaltarDatosDuros(texto) {
  // Encuentra cadenas de dígitos (incluso si tienen puntos o guiones como 123-456)
  return texto.replace(/\b\d+([.,-]\d+)*\b/g, '<span class="highlight-data">$&</span>');
}

// Función central de Traducción
async function procesarTraduccion(textoOriginal) {
  if (!textoOriginal.trim()) return;

  const now = new Date();
  const timeString = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  // Aplicamos el resaltado rojo al texto original
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
    
    // Aplicamos el resaltado rojo a la traducción también
    traduccionFinal = resaltarDatosDuros(traduccionFinal);
    
    messageDiv.querySelector('.translation').innerHTML = traduccionFinal;
    chatContainer.scrollTop = chatContainer.scrollHeight;
  } catch (error) {
    messageDiv.querySelector('.translation').innerText = "Error de conexión con Azure.";
  }
}

recognition.onresult = (event) => {
  let interimTranscript = '';
  
  for (let i = event.resultIndex; i < event.results.length; ++i) {
    if (event.results[i].isFinal) {
      // En lugar de enviar a traducir de inmediato, lo sumamos a la sala de espera (Buffer)
      textBuffer += ' ' + event.results[i][0].transcript.trim();
      
      // Reiniciamos la cuenta regresiva porque la persona sigue hablando
      clearTimeout(bufferTimeout);
      
      // Esperamos 1.2 segundos de silencio para asegurar que agrupe los números telefónicos
      bufferTimeout = setTimeout(() => {
        procesarTraduccion(textBuffer);
        textBuffer = ''; // Limpiamos la sala de espera
        interimTextDisplay.innerHTML = '';
      }, 1200);

    } else {
      interimTranscript += event.results[i][0].transcript;
    }
  }
  
  // Mostramos en gris lo que se está guardando + lo que está escuchando en tiempo real
  if(interimTranscript !== '' || textBuffer !== '') {
    interimTextDisplay.innerHTML = textBuffer + ' <span style="color:#bbb">' + interimTranscript + '</span>';
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

// Lógica del Botón de Ventana Flotante (PiP)
pipBtn.addEventListener('click', async () => {
  if (!('documentPictureInPicture' in window)) {
    alert("Tu navegador no soporta el modo flotante. Usa la versión más reciente de Chrome.");
    return;
  }
  
  try {
    const pipWindow = await documentPictureInPicture.requestWindow({
      width: 450,
      height: 600
    });
    
    // Copia los estilos de tu página a la ventanita flotante
    [...document.styleSheets].forEach((styleSheet) => {
      try {
        const cssRules = [...styleSheet.cssRules].map((rule) => rule.cssText).join('');
        const style = document.createElement('style');
        style.textContent = cssRules;
        pipWindow.document.head.appendChild(style);
      } catch (e) {}
    });
    
    // Mueve el panel de chat a la ventana flotante
    pipWindow.document.body.appendChild(chatContainer);
    
    // Cuando cierres la ventana flotante, regresa el chat a tu pestaña original
    pipWindow.addEventListener("pagehide", () => {
      document.body.insertBefore(chatContainer, document.getElementById('interim-text'));
    });
    
  } catch (error) {
    console.error("Error al abrir ventana flotante:", error);
  }
});