// This file defines the game rules for the online board game project.

export interface GameRule {
    name: string;
    description: string;
    applyRule: (gameState: any) => void;
}

export const rules: GameRule[] = [
    {
        name: "Basic Turn Rule",
        description: "Players take turns in a clockwise direction.",
        applyRule: (gameState) => {
            // Logic to enforce turn order
        }
    },
    {
        name: "Winning Condition",
        description: "The game ends when a player reaches the target score.",
        applyRule: (gameState) => {
            // Logic to check for winning condition
        }
    },
    {
        name: "Card Draw Rule",
        description: "Players draw a card at the beginning of their turn.",
        applyRule: (gameState) => {
            // Logic for drawing a card
        }
    }
];