
import { useAtomValue } from 'jotai';
import {
    actorProfilesAtom,
    llmPresetsAtom,
    ttsPresetsAtom,
    globalApiConfigAtom
} from '../store';

/**
 * Validates and hydrates Jotai storage atoms.
 * This ensures that when we imperatively get() these atoms in callbacks (like initGame),
 * they have definitely loaded their values from localStorage.
 */
const StateHydrator = () => {
    useAtomValue(actorProfilesAtom);
    useAtomValue(llmPresetsAtom);
    useAtomValue(ttsPresetsAtom);
    useAtomValue(globalApiConfigAtom);
    return null;
};

export default StateHydrator;
