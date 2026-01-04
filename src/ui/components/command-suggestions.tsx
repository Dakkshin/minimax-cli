import React, { useMemo } from "react";
import { Box, Text } from "ink";

interface CommandSuggestion {
  command: string;
  description: string;
}

interface CommandSuggestionsProps {
  suggestions: CommandSuggestion[];
  input: string;
  selectedIndex: number;
  isVisible: boolean;
}

export const MAX_SUGGESTIONS = 8;

export function filterCommandSuggestions<T extends { command: string }>(
  suggestions: T[],
  input: string
): T[] {
  const lowerInput = input.toLowerCase();
  return suggestions
    .filter((s) => s.command.toLowerCase().startsWith(lowerInput))
    .slice(0, MAX_SUGGESTIONS);
}

export function CommandSuggestions({
  suggestions,
  input,
  selectedIndex,
  isVisible,
}: CommandSuggestionsProps) {
  if (!isVisible) return null;

  const filteredSuggestions = useMemo(
    () => filterCommandSuggestions(suggestions, input),
    [suggestions, input]
  );

  return (
    <Box marginTop={1} flexDirection="column">
      {filteredSuggestions.map((suggestion, index) => (
        <Box key={index} paddingLeft={1}>
          <Text
            color={index === selectedIndex ? "black" : "white"}
            backgroundColor={index === selectedIndex ? "cyan" : undefined}
          >
            {suggestion.command}
          </Text>
          <Box marginLeft={1}>
            <Text color="gray">{suggestion.description}</Text>
          </Box>
        </Box>
      ))}
      <Box marginTop={1}>
        <Text color="gray" dimColor>
          ↑↓ navigate • Enter/Tab select • Esc cancel
        </Text>
      </Box>
    </Box>
  );
}

interface FileSuggestionsProps {
  files: string[];
  input: string;
  selectedIndex: number;
  isVisible: boolean;
}

export function FileSuggestions({
  files,
  input,
  selectedIndex,
  isVisible,
}: FileSuggestionsProps) {
  if (!isVisible || files.length === 0) return null;

  const filteredFiles = useMemo(() => {
    if (!input) return files.slice(0, MAX_SUGGESTIONS);
    const lowerInput = input.toLowerCase();
    return files
      .filter(file => file.toLowerCase().includes(lowerInput))
      .sort((a, b) => {
        const aLower = a.toLowerCase();
        const bLower = b.toLowerCase();
        if (aLower.startsWith(lowerInput) && !bLower.startsWith(lowerInput)) return -1;
        if (!aLower.startsWith(lowerInput) && bLower.startsWith(lowerInput)) return 1;
        return a.length - b.length;
      })
      .slice(0, MAX_SUGGESTIONS);
  }, [files, input]);

  return (
    <Box marginTop={1} flexDirection="column">
      {filteredFiles.map((file, index) => (
        <Box key={index} paddingLeft={1}>
          <Text
            color={index === selectedIndex ? "black" : "white"}
            backgroundColor={index === selectedIndex ? "green" : undefined}
          >
            @{file}
          </Text>
        </Box>
      ))}
      <Box marginTop={1}>
        <Text color="gray" dimColor>
          ↑↓ navigate • Enter/Tab select • Esc cancel
        </Text>
      </Box>
    </Box>
  );
}