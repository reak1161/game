import './style.css';
import './online.css';
import './battle.css';

if (location.pathname === '/local') {
  import('./local.js');
} else {
  import('./online.js');
}
