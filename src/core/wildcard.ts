function patternToRegExp(pattern: string): RegExp {
    let regex = '^';
    let trackIndex = 0;

    while (trackIndex < pattern.length) {
        const char = pattern[trackIndex]!;
        const next = pattern[trackIndex + 1];


        // Deep wild card ("**")
        if (char === "*" && next === "*") {
            regex += ".+";
            trackIndex += 2;
            continue;
        }

        // wild card ("*")
        if (char === "*") {
            regex += "[^\\s]+";
            trackIndex += 1;
            continue;
        }

        // Escape regex metacharacters
        regex += char.replace(
            /[.+^${}()|[\]\\]/g,
            '\\$&'
        )

        trackIndex += 1
    }
    regex += '$'
    return new RegExp(regex);
}

function isWildcardPattern(pattern: string): boolean {
    return pattern.includes('*')
}

function matchesPattern(pattern: string, value: string): boolean {
    return patternToRegExp(pattern).test(value)
}
export { patternToRegExp, isWildcardPattern, matchesPattern }
