export const extractScriptName = (command: string): string => {
    // Split by whitespace to get individual arguments
    const parts = command.split(/\s+/);

    // Find the part that ends with .py
    const pyFile = parts.find((part) => part.endsWith('.py'));

    if (!pyFile) {
        return command;
    }

    // Get the filename from the path (last part after splitting by /)
    const filename = pyFile.split('/').pop() || '';

    // Remove the .py extension
    const scriptName = filename.replace(/\.py$/, '');

    return scriptName || command;
};

// Example usage:
// extractScriptName("python src/lerobot/teleoperate.py --args") // returns "teleoperate"
// extractScriptName("python scripts/train.py --model=test") // returns "train"
// extractScriptName("python main.py") // returns "main"
