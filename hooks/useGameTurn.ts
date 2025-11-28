
import { useAtom } from 'jotai';
import { turnCountAtom } from '../atoms';

export const useGameTurn = () => {
    const [turn, setTurn] = useAtom(turnCountAtom);
    return { turn, setTurn };
};
