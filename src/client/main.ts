import './styles/base.css';
import './styles/header.css';
import './styles/battlefield.css';
import './styles/ledger.css';
import './styles/commandbar.css';
import './styles/dialogs.css';
import './styles/menu.css';
import './styles/guide.css';
import './styles/result.css';
import './styles/stockpile.css';
import './styles/lobby.css';
import { GameApplication } from './app.js';
// Non-accepting entry: Vite reloads changed client/game modules, preventing duplicate loops.
new GameApplication();

import './styles/maps.css';
