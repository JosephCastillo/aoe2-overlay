// -------------------------------------------------------------
// VARIABLES GLOBALES (Configuración basada en URL)
// -------------------------------------------------------------
const urlParams = new URLSearchParams(window.location.search);
const profileId = parseInt(urlParams.get("profileId"));

// NUEVA LÍNEA: Obtener el parámetro de estilo
const overlayStyle = urlParams.get("style") || 'horizontal'; // Default a horizontal

let wins = 0;
let losses = 0;
let enPartida = false;
let partidaActualId = null;

// Constante para la racha de 2 HORAS
const TIEMPO_MAXIMO_ENTRE_PARTIDAS_MS = 2 * 60 * 60 * 1000;

// Elementos DOM

const mainOverlayEl = document.getElementById("mainOverlay"); // Referencia al nuevo ID
const statusEl = document.getElementById("status");
const winsEl = document.getElementById("wins");
const lossesEl = document.getElementById("losses");

const matchTitleEl = document.getElementById("matchTitle");
const matchPlayersEl = document.getElementById("matchPlayers");
const matchElosEl = document.getElementById("matchElos");

const playerFlagEl = document.getElementById("playerFlag");
const opponentFlagEl = document.getElementById("opponentFlag");

const playerCivImg = document.getElementById("playerCivImg");
const opponentCivImg = document.getElementById("opponentCivImg");
const playerCivText = document.getElementById("playerCivText");
const opponentCivText = document.getElementById("opponentCivText");


// -------------------------------------------------------------
// INICIO Y CONEXIÓN
// -------------------------------------------------------------

// NUEVA LÓGICA: Aplicar el estilo al contenedor principal antes de conectar
if (mainOverlayEl) {
    // Aplicamos la clase que definiremos en el CSS: 'style-horizontal' o 'style-vertical'
    mainOverlayEl.classList.add(`style-${overlayStyle}`);
}

if (!profileId || isNaN(profileId)) {
    if (statusEl) statusEl.innerHTML = `
        ⚠️ Falta **profileId** en la URL. 
        Por favor, usa el <a href="config.html" target="_blank" style="color: #f7a040;">Generador de Enlace</a>.
    `;
    // Limpia el resto de la UI si falta el ID
    limpiarUI();
} else {
    conectar();
}


function conectar() {
    if (typeof WebSocket === 'undefined') {
        if (statusEl) statusEl.textContent = "⚠️ WebSocket no soportado.";
        return;
    }

    const socket = new WebSocket("wss://aoe2recs.com/dashboard/api/");

    socket.onopen = () => {
        if (statusEl) statusEl.textContent = "🔍 Conectado, enviando suscripción...";

        const subscriptionMessage = { "profile_id": profileId };

        if (socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify(subscriptionMessage));
        }
    }

    socket.onmessage = (event) => {
        try {
            const mensajes = JSON.parse(event.data);
            if (Array.isArray(mensajes)) {
                mensajes.forEach(msg => handleSocketMessage(msg));
            } else {
                handleSocketMessage(mensajes);
            }
        } catch (e) {
            // Ignorar mensajes que no son JSON
        }
    };

    socket.onclose = () => {
        if (statusEl) statusEl.textContent = "❌ Conexión cerrada. Reconectando en 5s...";
        setTimeout(conectar, 5000);
    }

    socket.onerror = (error) => {
        if (statusEl) statusEl.textContent = "❌ Error de conexión al servidor de AoE2 Recs.";
    };
}


// -------------------------------------------------------------
// FUNCIÓN PRINCIPAL: MANEJO DE MENSAJES DEL SOCKET
// -------------------------------------------------------------
function handleSocketMessage(msg) {

    // --- 1. MENSAJE PRINCIPAL (cls: 13) ---
    if (msg.cls === 13 && msg.data) {

        // La racha se recalcula
        inicializarHistorialDesdeSocket(msg.data.matches, msg.data.live);

        const liveMatch = msg.data.live;

        // Caso: jugador en partida en curso
        if (liveMatch && liveMatch.status === 'ongoing') {
            if (enPartida && liveMatch.id === partidaActualId) return;
            iniciarPartidaEnVivo(liveMatch);

        // Caso: partida terminada
        } else if (liveMatch && liveMatch.status === 'complete' && enPartida) {
            if (liveMatch.id === partidaActualId) {
                finalizarPartida(liveMatch);
            }

        // 🚨 NUEVO: Caso en espera (liveMatch null o no en curso)
        } else if (!liveMatch || liveMatch.status !== 'ongoing') {
            enPartida = false;
            partidaActualId = null;

            limpiarUI();

            if (statusEl) {
                if (wins + losses > 0) {
                    statusEl.textContent = `⌛ En espera de la próxima partida... (${wins}W - ${losses}L)`;
                } else {
                    statusEl.textContent = "⌛ En espera de la próxima partida...";
                }
            }
        }

        return;
    }

    // --- 2. FIN DE PARTIDA EN TIEMPO REAL (matchRemoved) ---
    if (msg.type === "matchRemoved" && enPartida) {
        setTimeout(conectar, 1000);

        limpiarUI();
        enPartida = false;
        partidaActualId = null;

        if (statusEl) statusEl.textContent = "⌛ En espera de la próxima partida...";
    }
}
// -------------------------------------------------------------
// FUNCIONES DE CONTROL DE ESTADO
// -------------------------------------------------------------

function iniciarPartidaEnVivo(match) {
    enPartida = true;
    partidaActualId = match.id;

    const mainPlayer = findPlayer(match);
    if (!mainPlayer) return;

    const opponent = findOpponent(match);

    if (matchTitleEl) matchTitleEl.textContent = `⚔️ ${match.leaderboardName || 'Ladder'} on ${match.rms || 'Mapa Desconocido'}`;
    
    // Nombres + banderas
    if (matchPlayersEl) matchPlayersEl.innerHTML = `
    <div class="player-line">
        <span class="fi fi-${mainPlayer.country}"></span> ${mainPlayer.name}
    </div>
    <div class="vs-line">VS</div>
    <div class="player-line">
        ${opponent ? `<span class="fi fi-${opponent.country}"></span> ${opponent.name}` : "-"}
    </div>
`;

    // Elo 
    const playerRating = mainPlayer.rating || "?";
    const opponentRating = opponent?.rating || "?";
    if (matchElosEl) matchElosEl.innerHTML = `
        <span class="fi fi-"></span> ${playerRating} 
        ⚔️ 
        ${opponent ? `<span class="fi fi-"></span> ${opponentRating}` : "-"}
    `;

    // Civilizaciones
    if (playerCivImg) playerCivImg.src = getCivIconUrl(mainPlayer.civilization) || "";
    if (playerCivText) playerCivText.textContent = mainPlayer.civilization || "";

    if (opponent) {
        if (opponentCivImg) opponentCivImg.src = getCivIconUrl(opponent.civilization) || "";
        if (opponentCivText) opponentCivText.textContent = opponent.civilization || "";
    } else {
        if (opponentCivImg) opponentCivImg.src = "";
        if (opponentCivText) opponentCivText.textContent = "-";
    }

    if (statusEl) statusEl.textContent = `🎮 Partida ${wins + losses + 1} en juego...`;
}

function finalizarPartida(match) {
    const resultado = getPlayerResult(match, profileId);

    if (resultado === true) {
        wins++;
        animarContador(winsEl);
        if (statusEl) statusEl.textContent = "✅ Victoria registrada";
    } else if (resultado === false) {
        losses++;
        animarContador(lossesEl);
        if (statusEl) statusEl.textContent = "❌ Derrota registrada";
    } else {
        if (statusEl) statusEl.textContent = "⚠️ Partida finalizada sin resultado registrado.";
    }

    actualizarMarcador();
    enPartida = false;
    partidaActualId = null;

    setTimeout(limpiarUI, 4000);
}


// -------------------------------------------------------------
// LÓGICA DE RACHA DE 2 HORAS (PAUSA ENTRE PARTIDAS)
// -------------------------------------------------------------
function inicializarHistorialDesdeSocket(matches, liveMatch) {
    wins = 0;
    losses = 0;

    let ultimoFinMs = null;

    // Recorremos el historial del más reciente al más antiguo
    for (const match of matches) {

        if (match.status !== "complete" || !match.started || !match.duration) continue;

        // Conversión de segundos a milisegundos (UNIX)
        const finishedMs = (match.started + match.duration) * 1000;
        const startedMs = match.started * 1000;

        // LÓGICA DE CORTE DE SESIÓN DE 2 HORAS (Pausa entre el final de la anterior y el inicio de esta)
        if (ultimoFinMs !== null) {
            const tiempoDePausa = Math.abs(startedMs - ultimoFinMs);

            if (tiempoDePausa > TIEMPO_MAXIMO_ENTRE_PARTIDAS_MS) {
                break; // Corta la racha
            }
        }

        // CLAVE: Obtener resultado usando la función robusta
        const resultado = getPlayerResult(match, profileId);

        if (resultado === true) {
            wins++;
        } else if (resultado === false) {
            losses++;
        }

        ultimoFinMs = finishedMs;
    }

    actualizarMarcador();
}


// -------------------------------------------------------------
// FUNCIONES AUXILIARES ROBUSTAS (CLAVE PARA EL CONTEO W/L)
// -------------------------------------------------------------

function findPlayer(match) {
    // Busca el objeto completo del jugador principal
    if (match.players) return match.players.find(p => p.id === profileId || p.profileId === profileId);

    if (match.teams && match.players) {
        for (const t of match.teams) {
            const p = (t.members || [])
                .map(memberIndex => match.players.find(p => p.number === memberIndex))
                .find(p => p?.id === profileId || p?.profileId === profileId);
            if (p) return p;
        }
    }
    return null;
}

/**
 * Función robusta para determinar si el jugador principal ganó (true) o perdió (false).
 */
function getPlayerResult(match, playerId) {
    const player = findPlayer(match);

    if (!player) return null; // El jugador principal no está en la partida.

    // 1. Intentar obtener el resultado del objeto del jugador (a veces viene aquí)
    if (player.winner === true) return true;
    if (player.winner === false) return false;

    // 2. Si no está en el jugador, buscar en el array de equipos (lo más confiable)
    if (match.teams && match.players) {
        const playerNumber = player.number;

        if (playerNumber) {
            const playerTeam = match.teams.find(t => t.members.includes(playerNumber));

            if (playerTeam) {
                // Verificar si el equipo ganó
                if (playerTeam.winner === true) return true;
                // Verificar si el equipo perdió
                if (playerTeam.loser === true || (match.diplomacy === '1v1' && playerTeam.winner !== true)) {
                    // Si es 1v1 y el equipo no ganó, es una derrota.
                    return false;
                }
            }
        }
    }

    return null; // Resultado no encontrado.
}

function findOpponent(match) {
    if (!match.players) return null;

    if (match.diplomacy === '1v1') {
        return match.players.find(p => p.id !== profileId && p.profileId !== profileId);
    }

    const opponent = match.players.find(p => p.id !== profileId && p.profileId !== profileId);
    return opponent || null;
}

function actualizarMarcador() {
    if (winsEl && lossesEl) {
        winsEl.textContent = wins;
        lossesEl.textContent = losses;
    }
}

function animarContador(el) {
    if (el) {
        el.classList.add("updated");
        setTimeout(() => el.classList.remove("updated"), 600);
    }
}

function limpiarUI() {
    if (matchTitleEl) matchTitleEl.textContent = "⚔️ Esperando partida...";
    if (matchPlayersEl) matchPlayersEl.textContent = "-";

    if (playerFlagEl) playerFlagEl.src = "";
    if (opponentFlagEl) opponentFlagEl.src = "";
    if (playerCivImg) playerCivImg.src = "";
    if (playerCivText) playerCivText.textContent = "-";
    if (opponentCivImg) opponentCivImg.src = "";
    if (opponentCivText) opponentCivText.textContent = "-";
    if (matchElosEl) matchElosEl.textContent = "-";
}



function getCivIconUrl(civilizationName) {
    if (!civilizationName) return "";

    // Normalizar: pasar a minúsculas y reemplazar espacios por nada
    const fileName = civilizationName.toLowerCase().replace(/\s+/g, "");

    return `https://raw.githubusercontent.com/SiegeEngineers/aoe2techtree/master/img/Civs/${fileName}.png`;
}

