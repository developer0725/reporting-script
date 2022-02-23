import { EmbeddedActionsParser } from 'chevrotain';

import TOKENS, {
  KEY_PROJECT,
  HYPHEN,
  KEY_NUMBER,
  COLON,
  SPACE,
  DESCRIPTION,
} from './tokens';

class NoteParser extends EmbeddedActionsParser {
  private keyValue!: () => string;
  private key!: () => string;
  private description!: () => string;

  public note!: () => undefined | { key: string; description: string | undefined };

  constructor() {
    super(TOKENS, { nodeLocationTracking: 'onlyOffset' });

    this.RULE('keyValue', () => {
      const project = this.CONSUME(KEY_PROJECT);
      this.CONSUME(HYPHEN);
      const number = this.CONSUME(KEY_NUMBER);

      return `${project.image}-${number.image}`;
    });

    this.RULE('key', () => {
      const value = this.SUBRULE<string>(this.keyValue);
      this.CONSUME(COLON);
      return value!;
    });

    this.RULE('description', () => {
      this.AT_LEAST_ONE(() => this.CONSUME(SPACE));
      const token = this.CONSUME(DESCRIPTION);
      return token.image;
    });

    this.RULE('note', () => {
      const key = this.SUBRULE<string>(this.key);
      const description = this.OPTION<string | undefined>(() => this.SUBRULE<string>(this.description));
      return { key, description };
    });

    this.performSelfAnalysis();
  }
}

export default new NoteParser();
