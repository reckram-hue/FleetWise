
import React from 'react';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
  id?: string;
}

const Card: React.FC<CardProps> = ({ children, className = '', onClick, id }) => {
  return (
    <div
      id={id}
      className={`bg-white rounded-lg shadow-md p-6 ${className}`}
      onClick={onClick}
    >
      {children}
    </div>
  );
};

export default Card;
