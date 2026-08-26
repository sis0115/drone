import { App } from '@/app/App';
import { LinkScreen } from '@/app/screens/LinkScreen';
import { BriefingScreen } from '@/app/screens/BriefingScreen';
import { DebriefScreen } from '@/app/screens/DebriefScreen';
import { LoadoutScreen } from '@/app/screens/LoadoutScreen';
import { FlightScreen } from '@/app/screens/FlightScreen';
import { installDebug } from '@/debug';
import './style.css';

/**
 * 엔트리포인트. **배선만 한다** — 로직은 App 과 화면들에 있다.
 * 여기가 길어지면 구조가 무너지고 있다는 신호다.
 */
const canvas = document.getElementById('view') as HTMLCanvasElement;
const overlay = document.getElementById('overlay') as HTMLElement;

const app = new App(canvas, overlay);
const flight = new FlightScreen();

app.register(new LinkScreen()).register(flight).register(new DebriefScreen()).register(new LoadoutScreen()).register(new BriefingScreen());
installDebug(app, flight);
app.start('loadout');
