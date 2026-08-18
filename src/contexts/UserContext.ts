
import React from 'react';
import { User } from '../types';

interface UserContextType {
  currentUser: User | null;
  setCurrentUser: (user: User | null) => void;
}

export const UserContext = React.createContext<UserContextType>({
  currentUser: null,
  setCurrentUser: () => { },
});
