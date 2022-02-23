import { deHomoglyph } from 'de-homoglyph';

import NOTE_LEXER from './lexer';
import NOTE_PARSER from './parser';
import { ParseError } from './error';

function parseNoteUnsafe(note: string): { key: string; description: string } {
  const normalized = deHomoglyph(note);

  const lexingResult = NOTE_LEXER.tokenize(normalized);
  if (lexingResult.errors.length > 0) {
    const error = lexingResult.errors[0];
    throw new ParseError(error.message, normalized, error.offset);
  }

  NOTE_PARSER.input = lexingResult.tokens;
  const parsingResult = NOTE_PARSER.note();
  if (NOTE_PARSER.errors.length > 0) {
    throw ParseError.fromParserError(NOTE_PARSER.errors[0], normalized);
  }

  const { key, description } = parsingResult!;
  return { key: key.toUpperCase(), description: description ?? ' ' };
}

export interface ValidNote {
  valid: true;
  key: string;
  description: string;
  note: string;
}

export interface InvalidNote {
  valid: false;
  note: string;
  error: Error;
}

export default function parseNote(note: string): ValidNote | InvalidNote {
  try {
    const { key, description } = parseNoteUnsafe(note);
    return { valid: true, key, description, note };
  } catch (error) {
    return { valid: false, note, error };
  }
}
