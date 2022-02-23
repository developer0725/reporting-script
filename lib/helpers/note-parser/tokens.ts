import { createToken } from 'chevrotain';

export const START_BRACKET = createToken({ name: 'StartBracket', pattern: '[', label: '[' });
export const START_PARENTHESIS = createToken({ name: 'StartParen', pattern: '(', label: '(' });
export const KEY_PROJECT = createToken({ name: 'KeyProject', pattern: /[a-zA-Z]+/, label: 'issue key project' });
export const HYPHEN = createToken({ name: 'Hyphen', pattern: '-', label: '-' });
export const KEY_NUMBER = createToken({ name: 'KeyNumber', pattern: /[0-9]+/, label: 'issue key number' });
export const END_BRACKET = createToken({ name: 'EndBracket', pattern: ']', label: ']', push_mode: 'description' });
export const END_PARENTHESIS = createToken({ name: 'EndParen', pattern: ')', label: ')', push_mode: 'description' });
export const COLON = createToken({ name: 'Colon', pattern: / ?:/, label: ':', push_mode: 'description' });
export const SPACE = createToken({ name: 'Space', pattern: ' ', label: ' ', push_mode: 'description' });
export const DESCRIPTION = createToken({ name: 'Description', pattern: /.+/, label: 'description' });

export default {
  modes: {
    key: [
      START_BRACKET,
      START_PARENTHESIS,
      KEY_PROJECT,
      HYPHEN,
      KEY_NUMBER,
      END_BRACKET,
      END_PARENTHESIS,
      COLON,
      SPACE,
    ],
    description: [COLON, SPACE, DESCRIPTION],
  },
  defaultMode: 'key',
};
