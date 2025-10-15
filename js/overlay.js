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


// Importación de elementos DOM
import { mainOverlayEl, statusEl, winsEl, lossesEl, matchTitleEl, matchPlayersEl, matchElosEl, playerFlagEl, opponentFlagEl, playerCivImg, opponentCivImg, playerCivText, opponentCivText } from "./domElements.js";


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
                // Nombre y ELO actual
                let playerName = "Jugador";
                let currentElo = "?";

                if (msg.data.players) {
                    // Caso live match
                    const mainPlayer = msg.data.players.find(p => p.id === profileId);
                    if (mainPlayer) playerName = mainPlayer.name;
                } else if (msg.data.player) {
                    // Caso sin partida en curso
                    playerName = msg.data.player.name;
                }

                if (msg.data.ladders) {
                    const ladder1v1 = msg.data.ladders.find(l => l.name === "1v1 Random Map");
                    if (ladder1v1) currentElo = ladder1v1.current;
                }

                // Actualizamos el status
                statusEl.innerHTML = `<span class="EsperaPartida">⌛ En espera de la próxima partida...</span>  <span class="enEspera">${playerName} &nbsp;<wbr>Current&nbsp;Elo:&nbsp;${currentElo}</span>`;
                console.log(losses + " " + playerName + " " + currentElo);
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

    const matchInfoEl = document.getElementById("matchInfo");
    if (matchInfoEl) matchInfoEl.classList.remove("hidden"); // Mostrar sección

    const mainPlayer = findPlayer(match);
    if (!mainPlayer) return;
    const opponent = findOpponent(match);

    // Título
    if (matchTitleEl) matchTitleEl.textContent = `⚔️${match.type || 'Tipo desconocido'} ${match.diplomacy || 'Ladder'} on ${match.rms || 'Mapa Desconocido'}`;

    // Jugadores + banderas
    if (overlayStyle === "horizontal") {
        matchPlayersEl.innerHTML = `
        <div id="scrollText">
            <span class="fi fi-${mainPlayer.country}"></span>&nbsp;${mainPlayer.name}
            &nbsp;&nbsp;<span class="vs-line">VS</span>&nbsp;&nbsp;
            ${opponent ? `<span class="fi fi-${opponent.country}"></span>&nbsp;${opponent.name}` : "-"}
        </div>
    `;
        // Medir *después* de que el navegador haya pintado para obtener scrollWidth correcto
        requestAnimationFrame(() => {
            const scrollTextEl = document.getElementById("scrollText");
            if (!scrollTextEl) return;

            const containerWidth = matchPlayersEl.clientWidth;   // ancho visible
            const contentWidth = scrollTextEl.scrollWidth;       // ancho del texto completo
            const diff = containerWidth - contentWidth;
            const extraRight = Math.max(20, Math.abs(diff) * 0.1);

            // Si el contenido sobresale -> aplicar efecto rebote (bounce)
            if (contentWidth > containerWidth + 2) { // +2 px margen de seguridad
                // quitar cualquier clase de marquee y usar bounce
                scrollTextEl.classList.remove("scroll-text");
                scrollTextEl.classList.add("scroll-bounce");

                // pasar variable para el keyframe (usada en calc())
                scrollTextEl.style.setProperty("--scroll-diff", (diff - extraRight) + "px");

                // opcional: ajustar duración según overflow
                const ratio = contentWidth / containerWidth;
                const duration = Math.max(4, Math.min(10, Math.ceil(ratio * 3))); // entre 4s y 10s
                scrollTextEl.style.animationDuration = duration + "s";
            } else {
                // No hay overflow: asegurar que no tenga animación
                scrollTextEl.classList.remove("scroll-bounce", "scroll-text");
                scrollTextEl.style.removeProperty("--container-width");
                scrollTextEl.style.animation = "none";
                scrollTextEl.style.width = "auto";
            }
        });
    } else if (overlayStyle === "vertical") {
        matchPlayersEl.innerHTML = `
        <div id="scrollTextVertical">
            <div class="player">
                <span class="fi fi-${mainPlayer.country}"></span>
                <span class="name">${mainPlayer.name}</span>
            </div>
            <span class="vs-line">vs</span>
            <div class="player">
                ${opponent ? `<span class="fi fi-${opponent.country}"></span><span class="name">${opponent.name}</span>` : "-"}
            </div>
        </div>
    `;

        // Aplicar animación bounce si hay overflow
        requestAnimationFrame(() => {
            const scrollTextEl = document.getElementById("scrollTextVertical");
            if (!scrollTextEl) return;

            const containerWidth = matchPlayersEl.clientWidth;
            const contentWidth = scrollTextEl.scrollWidth;
            console.log("Container width:", containerWidth, "Content width:", contentWidth);
            const diff = (containerWidth - contentWidth) * 2;
            const extraRight = Math.max(20, Math.abs(diff) * 0.1);


            if (contentWidth > containerWidth - 5) {
                scrollTextEl.classList.add("scroll-bounce");

                // diferencia real (será negativa si el texto es más ancho)

                scrollTextEl.style.setProperty("--scroll-diff", (diff - extraRight) + "px");

                // ajustar velocidad según proporción
                const ratio = contentWidth / containerWidth;
                const duration = Math.max(4, Math.min(12, Math.ceil(ratio * 3)));
                scrollTextEl.style.animationDuration = duration + "s";
            } else {
                scrollTextEl.classList.remove("scroll-bounce");
                scrollTextEl.style.removeProperty("--scroll-diff");
                scrollTextEl.style.animation = "none";
            }
        });
    }

    // ELO
    const playerRating = mainPlayer.rating || "?";
    const opponentRating = opponent?.rating || "?";
    if (matchElosEl) {
        matchElosEl.innerHTML = `<span class="rated">${playerRating}</span>  ⚔️ ${opponent ? `<span class="rated"> ${opponentRating}</span>` : "-"}`;
    }

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

    // Forzar display de ELO y spans de civ en horizontal
    if (overlayStyle === 'horizontal') {
        if (matchElosEl) matchElosEl.style.display = "flex";
        const civSpans = document.querySelectorAll("#matchCivs span");
        civSpans.forEach(span => span.style.display = "inline");
    }

    if (statusEl) statusEl.textContent = `🎮 Partida ${wins + losses + 1} en juego...`;

    animarInicioPartida();
}


function finalizarPartida(match) {

    console.log("🔔 FINALIZANDO PARTIDA:", match);

    const resultado = getPlayerResult(match, profileId);
    console.log("Resultado detectado:", resultado);


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


    animarFinPartidaGlobal(resultado);
    setTimeout(() => {
        console.log("⏱️ Lanzando animarFinPartida...");
        animarFinPartida(resultado);
    }, 4000);

}

// -------------------------------------------------------------
// LÓGICA DE RACHA DE 2 HORAS (PAUSA ENTRE PARTIDAS)
// -------------------------------------------------------------
function inicializarHistorialDesdeSocket(matches, liveMatch) {
    wins = 0;
    losses = 0;

    let ultimoFinMs = null; // tu variable actual de racha
    let ultimaPartidaJugMs = null; // nueva variable para la última partida jugada

    // Recorremos el historial del más reciente al más antiguo
    for (const match of matches) {

        if (match.status !== "complete" || !match.started || !match.duration) continue;

        // Asegurar que started y duration sean números
        const started = Number(match.started);
        const duration = Number(match.duration);

        // Conversión de segundos a milisegundos (UNIX)
        const startedMs = started * 1000;
        const finishedMs = (started + duration) * 1000;

        // Guardar siempre la fecha de la última partida jugada
        if (!ultimaPartidaJugMs) {
            ultimaPartidaJugMs = finishedMs; // solo se asigna la primera vez
        }

        // LÓGICA DE CORTE DE SESIÓN DE 2 HORAS (Pausa entre el final de la anterior y el inicio de esta)
        if (ultimoFinMs !== null) {
            const tiempoDePausa = Math.abs(startedMs - ultimoFinMs);
            if (tiempoDePausa > TIEMPO_MAXIMO_ENTRE_PARTIDAS_MS) {
                console.log("⏲️ Racha cortada por pausa de más de 2 horas entre partidas para mostrar en el contador.");
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

    console.log("Última partida jugada (ms):", ultimaPartidaJugMs);
    console.log("Última partida dentro de la racha (ms):", ultimoFinMs);

    // Actualiza el marcador si la ultima partida jugada fue hace más de 2 horas
    const ahoraMs = Date.now();
    if (ultimaPartidaJugMs !== null) {
        const tiempoDesdeUltimaPartida = ahoraMs - ultimaPartidaJugMs;
        console.log("Tiempo desde última partida jugada (ms):", tiempoDesdeUltimaPartida);
        if (tiempoDesdeUltimaPartida > TIEMPO_MAXIMO_ENTRE_PARTIDAS_MS) {
            wins = 0;
            losses = 0;
            console.log("⏲️ Racha reiniciada por inactividad de más de 2 horas.");
        }
    }

    // Si hay una partida en vivo, verificar la pausa entre el último fin de racha y el inicio de esta
    if (liveMatch && ultimoFinMs !== null) {
        let gap = (Number(liveMatch.started) * 1000) - ultimoFinMs;
        if (gap < 0) gap = 0; // normalizamos
        console.log("Gap con partida en vivo (ms):", gap);
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
    const matchInfoEl = document.getElementById("matchInfo");
    if (matchInfoEl) matchInfoEl.classList.add("hidden"); // Oculta toda la sección

    // Resetear texto de partida y jugadores
    if (matchTitleEl) matchTitleEl.textContent = "⚔️ Esperando partida...";
    if (matchPlayersEl) matchPlayersEl.textContent = "-";

    // Resetear banderas
    if (playerFlagEl) playerFlagEl.src = "";
    if (opponentFlagEl) opponentFlagEl.src = "";

    // Resetear civilizaciones
    if (playerCivImg) playerCivImg.src = "";
    if (playerCivText) playerCivText.textContent = "-";
    if (opponentCivImg) opponentCivImg.src = "";
    if (opponentCivText) opponentCivText.textContent = "-";

    // Resetear ELO
    if (matchElosEl) matchElosEl.textContent = "-";

    // Si es horizontal, ocultar spans de civ y ELO que CSS oculta
    if (overlayStyle === 'horizontal') {
        const playerCivImg = document.getElementById("playerCivImg");
        const opponentCivImg = document.getElementById("opponentCivImg");
        const playerCivText = document.getElementById("playerCivText");
        const opponentCivText = document.getElementById("opponentCivText");
        if (playerCivImg) playerCivImg.src = "";
        if (playerCivText) playerCivText.textContent = "-";
        if (opponentCivImg) opponentCivImg.src = "";
        if (opponentCivText) opponentCivText.textContent = "-";
        if (playerCivImg) playerCivImg.style.display = "none";
        if (playerCivText) playerCivText.style.display = "none";
        if (opponentCivImg) opponentCivImg.style.display = "none";
        if (opponentCivText) opponentCivText.style.display = "none";
        if (matchElosEl) matchElosEl.style.display = "none";
        const civSpans = document.querySelectorAll("#matchCivs span");
        civSpans.forEach(span => span.style.display = "none");
    }
}


// -------------------------------------------------------------
// FUNCIONES DE ANIMACIÓN
// -------------------------------------------------------------

function animarInicioPartida() {
    if (!mainOverlayEl) return;

    // 1️⃣ Forzar estado inicial invisible y escalado
    mainOverlayEl.style.opacity = 0;
    mainOverlayEl.style.transform = "scale(1.5)";
    mainOverlayEl.style.transition = "all 1s ease-out";

    // 2️⃣ Asegurar que el navegador registre los estilos iniciales
    setTimeout(() => {
        mainOverlayEl.style.opacity = 1;
        mainOverlayEl.style.transform = "scale(1)";
    }, 50); // 50ms es suficiente
}

function animarFinPartida(resultado) {
    const statusEl = document.getElementById("status");
    const scoreboardEl = document.querySelector(".scoreboard");

    if (!statusEl || !scoreboardEl) return;

    // Cambiar el texto del status al resultado
    statusEl.textContent = resultado ? "Victoria 🎉" : "Derrota ❌";

    // Animación de status (brillo de color)
    statusEl.style.transition = "color 5s ease, text-shadow 5s ease";
    statusEl.style.color = resultado ? "gold" : "red";
    statusEl.style.textShadow = resultado
        ? "0 0 20px gold"
        : "0 0 20px red";

    setTimeout(() => {
        statusEl.style.color = "";
        statusEl.style.textShadow = "none";
    }, 2000);

    // Animación de scoreboard (zoom + resplandor)
    scoreboardEl.style.transition = "transform 5s ease, box-shadow 5s ease";
    scoreboardEl.style.transform = "scale(1.2)";
    scoreboardEl.style.boxShadow = resultado
        ? "0 0 25px gold"
        : "0 0 25px red";

    setTimeout(() => {
        scoreboardEl.style.transform = "scale(1)";
        scoreboardEl.style.boxShadow = "none";
    }, 800);
}




function animarFinPartidaGlobal(resultado) {
    if (!mainOverlayEl) return;

    // Estado inicial
    mainOverlayEl.style.transition = "all 2s ease";
    mainOverlayEl.style.transform = "scale(1.1)";
    mainOverlayEl.style.opacity = 0.7;
    mainOverlayEl.style.boxShadow = resultado
        ? "0 0 20px 10px gold"
        : "0 0 20px 10px red";

    // Esperar al siguiente frame para resetear
    setTimeout(() => {
        mainOverlayEl.style.transform = "scale(1)";
        mainOverlayEl.style.opacity = 1;
        mainOverlayEl.style.boxShadow = "none";
    }, 50);
}



function getCivIconUrl(civilizationName) {
    if (!civilizationName) return "";

    // Normalizar: pasar a minúsculas y reemplazar espacios por nada
    const fileName = civilizationName.toLowerCase().replace(/\s+/g, "");

    return `https://raw.githubusercontent.com/SiegeEngineers/aoe2techtree/master/img/Civs/${fileName}.png`;
}

