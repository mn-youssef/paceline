import { fireConfetti } from '../../src/ui/confetti';
import './style.css';

fireConfetti(2_000);
setTimeout(() => window.close(), 4_000);
