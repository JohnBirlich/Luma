import { createContext, useContext } from 'react';
import { textFor } from './text';
export const UiText = createContext(textFor('ru'));
export const useText = () => useContext(UiText);
