import { IRecognitionException, IToken } from 'chevrotain';

interface IPreviousTokenRecognitionException extends IRecognitionException {
  previousToken: IToken;
}

export class ParseError extends Error {
  static fromParserError(error: IRecognitionException, value: string): ParseError {
    let offset = error.token.startOffset;
    if (Number.isNaN(offset) && 'previousToken' in error) {
      const previousToken = (error as IPreviousTokenRecognitionException).previousToken;
      offset = previousToken.startOffset + previousToken.image.length;
    }

    return new ParseError(value, error.message, offset);
  }

  public value: string;
  public originalMessage: string;
  public offset: number;

  constructor(value: string, message: string, offset: number) {
    super('Failed to parse note:\n' + value + '\n' + '-'.repeat(offset) + '^\n' + message);
    this.value = value;
    this.originalMessage = message;
    this.offset = offset;
  }
}
