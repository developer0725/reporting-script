import { Lexer } from 'chevrotain';

import TOKENS from './tokens';

export default new Lexer(TOKENS, { positionTracking: 'onlyOffset' });
