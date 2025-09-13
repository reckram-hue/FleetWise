
import React from 'react';
import { User } from '../types';

interface UserContextType {
  currentUser: User | null;
  setCurrentUser: React.Dispatch<React.SetStateAction<User | null>>;
}

export const UserContext = React.createContext<UserContextType>({
  currentUser: null,
  setCurrentUser: () => {},
});
