let currentSuggestionMap = {
  "Failed to load texture": "Texture file not found. This is expected if textures are not embedded in the model. The app has applied a default material.",
  "Invalid or missing material": "Texture file not found. This is expected if textures are not embedded in the model. The app has applied a default material.",
  "Failed to retarget animation clip": "Ensure skeletons match and scales are applied correctly.",
  "Invalid model data": "Check if the model has a valid skeleton or load a JSON skeleton."
};

// Store logged messages for logOnce and warnOnce
const loggedOnceMessages = new Set();

function getLogContainer() {
  let container = document.getElementById('debugLog');
  if (!container) {
    container = document.createElement('div');
    container.id = 'debugLog';
    Object.assign(container.style, {
      position: 'fixed',
      bottom: '0',
      left: '0',
      width: '100%',
      maxHeight: '150px',
      overflowY: 'auto',
      backgroundColor: 'rgba(0,0,0,0.7)',
      fontSize: '12px',
      zIndex: '9999',
      padding: '5px',
      boxSizing: 'border-box',
      color: 'white',
      fontFamily: 'monospace',
      display: 'none'
    });

    const copyButton = document.createElement('button');
    copyButton.textContent = 'Copy Log';
    Object.assign(copyButton.style, {
      position: 'absolute',
      top: '5px',
      right: '5px',
      padding: '2px 5px',
      fontSize: '10px',
      cursor: 'pointer'
    });
    copyButton.addEventListener('click', () => {
      const logText = Array.from(container.childNodes)
        .filter(node => node.tagName === 'P')
        .map(p => p.textContent)
        .join('\n');
      navigator.clipboard.writeText(logText).catch(err => {
        console.error('Failed to copy log:', err);
      });
    });

    container.appendChild(copyButton);
    document.body.appendChild(container);
  }
  return container;
}

function stringifyArg(arg, depth = 2) {
  if (arg === null || arg === undefined) return 'undefined';
  if (typeof arg === 'string') return arg;
  try {
    return JSON.stringify(arg, (k, v) => {
      if (typeof v === 'object' && v !== null) {
        if (depth <= 0) return '[Object]';
        depth--;
      }
      return v === undefined ? 'undefined' : v;
    }, 2);
  } catch (e) {
    return `Stringify error: ${String(arg)}`;
  }
}

function appendToLogContainer(message, color = 'white') {
  const container = getLogContainer();
  const p = document.createElement('p');
  p.style.color = color;

  const timestamp = new Date().toLocaleTimeString('en-US', { hour12: false });
  p.textContent = `[${timestamp}] ${message}`;

  for (const key in currentSuggestionMap) {
    if (message.includes(key)) {
      const span = document.createElement('span');
      span.textContent = " " + currentSuggestionMap[key];
      span.style.color = 'lime';
      p.appendChild(span);
      break;
    }
  }

  container.appendChild(p);
  container.scrollTop = container.scrollHeight;
}

const originalLog = console.log;
const originalWarn = console.warn;
const originalError = console.error;

function overrideConsoleLoggers() {
  console.log = function (...args) {
    originalLog.apply(console, args);
    const message = args.map(arg => stringifyArg(arg)).join(' ');
    appendToLogContainer(message, 'white');
  };

  console.warn = function (...args) {
    originalWarn.apply(console, args);
    const message = args.map(arg => stringifyArg(arg)).join(' ');
    appendToLogContainer(message, 'yellow');
  };

  console.error = function (...args) {
    originalError.apply(console, args);
    const message = args.map(arg => stringifyArg(arg)).join(' ');
    appendToLogContainer(message, 'red');
  };
}

export const DebugLogger = {
  init(enable = false) {
    if (!window.__debugLoggerInitialized && enable) {
      window.__debugLoggerInitialized = true;
      getLogContainer();
      overrideConsoleLoggers();
      originalLog('Debug logger initialized');
    }
  },

  show() {
    getLogContainer().style.display = 'block';
  },

  hide() {
    getLogContainer().style.display = 'none';
  },

  setSuggestionMap(map) {
    currentSuggestionMap = map;
  },

  log(...args) {
    const message = args.map(arg => stringifyArg(arg)).join(' ');
    originalLog(message);
    appendToLogContainer(message, 'white');
  },

  logOnce(message, key, data) {
    if (!loggedOnceMessages.has(key)) {
      originalLog(message, data);
      appendToLogContainer(`${message}${data ? ': ' + stringifyArg(data) : ''}`, 'white');
      loggedOnceMessages.add(key);
    }
  },

  warn(message) {
    originalWarn(message);
    appendToLogContainer(message, 'yellow');
  },

  warnOnce(message, data, key) {
    if (!loggedOnceMessages.has(key)) {
      originalWarn(message, data);
      appendToLogContainer(`${message}: ${stringifyArg(data)}`, 'yellow');
      loggedOnceMessages.add(key);
    }
  },

  error(message) {
    originalError(message);
    appendToLogContainer(message, 'red');
  },

  async debugImportResolve(modulePath) {
    try {
      const mod = await import(modulePath);
      this.log(`Successfully imported module: ${modulePath}`);
      return mod;
    } catch (error) {
      this.error(`Failed to import module "${modulePath}": ${error.message}`);
      return null;
    }
  },

  async resolveModules(moduleNames) {
    const modules = {};
    for (const name of moduleNames) {
      const mod = await this.debugImportResolve(name);
      if (mod) {
        modules[name] = mod;
        this.log(`Module ${name} resolved.`);
      }
    }
    return modules;
  }
};