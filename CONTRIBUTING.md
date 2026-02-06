# Contributing to Gyro

Thank you for your interest in contributing to Gyro! We appreciate your help in making this language better. This document provides guidelines and instructions for contributing.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Workflow](#development-workflow)
- [Coding Standards](#coding-standards)
- [Commit Messages](#commit-messages)
- [Pull Requests](#pull-requests)
- [Reporting Issues](#reporting-issues)
- [Project Structure](#project-structure)

## Code of Conduct

By participating in this project, you agree to:

- Be respectful and inclusive
- Welcome diverse perspectives
- Focus on constructive feedback
- Report inappropriate behavior to the maintainers
- No harassment, discrimination, or offensive language

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn
- Git
- Basic TypeScript knowledge

### Setting Up Development Environment

1. **Fork the repository**
   ```bash
   # Visit https://github.com/nifemibosun/gyro-lang and click "Fork"
   ```

2. **Clone your fork**
   ```bash
   git clone https://github.com/YOUR_USERNAME/gyro-lang.git
   cd gyro-lang
   ```

3. **Add upstream remote**
   ```bash
   git remote add upstream https://github.com/nifemibosun/gyro-lang.git
   ```

4. **Install dependencies**
   ```bash
   npm install
   ```

5. **Build the project**
   ```bash
   npm run build
   ```

6. **Run tests**
   ```bash
   npm test
   ```

## Development Workflow

### Creating a Feature Branch

```bash
# Update main branch
git fetch upstream
git checkout main
git merge upstream/main

# Create feature branch
git checkout -b feature/your-feature-name
```

### Making Changes

1. Make your changes in the appropriate source files
2. Ensure your code follows the coding standards (see below)
3. Add or update tests if applicable
4. Test your changes locally

```bash
npm run build
npm test
```

### Committing Changes

```bash
git add .
git commit -m "Your commit message (see Commit Messages section)"
```

### Pushing and Creating a Pull Request

```bash
git push origin feature/your-feature-name
```

Then visit the GitHub repository and create a Pull Request. Fill out the PR template completely.

## Coding Standards

### File Organization

- One main export per file (when possible)
- Group related functions together
- Place types/interfaces at the top of the file
- Organize imports alphabetically

### Code Quality

- No unused variables or imports
- No console.log statements in production code
- Avoid deep nesting (max 3 levels)
- Keep functions under 50 lines when possible
- Write descriptive comments for "why", not "what"

### Types

- **feat**: A new feature
- **fix**: A bug fix
- **docs**: Documentation changes
- **style**: Code style changes (formatting, missing semicolons)
- **refactor**: Code refactoring without feature/fix changes
- **perf**: Performance improvements
- **test**: Adding or updating tests
- **chore**: Dependencies, build tools, configuration

### Examples

```
feat(parser): add support for import statements

Implement parsing of ES6-style import statements including named imports,
namespace imports, and import aliases. This enables the module system feature.

Fixes #42
```

```
fix(vm): resolve stack underflow on program exit

Check stack length before popping final value to prevent underflow errors
when programs terminate without returning values.
```

```
docs(readme): update feature list

Add description of newly implemented module system and update examples.
```

## Pull Requests

### Before Creating a PR

- [ ] All tests pass locally (`npm test`)
- [ ] Code follows the style guide
- [ ] No console.log or debugging code left
- [ ] Branch is updated with latest upstream changes
- [ ] Commit history is clean and meaningful

### PR Template

```markdown
## Description
Brief description of what this PR does

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Documentation update
- [ ] Performance improvement

## Related Issues
Fixes #(issue number)

## Changes Made
- Change 1
- Change 2
- Change 3

## Testing
Describe how you tested these changes

## Checklist
- [ ] Tests pass locally
- [ ] New tests added (if applicable)
- [ ] Documentation updated
- [ ] No breaking changes
```

### Review Process

- At least one maintainer will review your PR
- We may request changes or ask clarifying questions
- Once approved, your PR will be merged
- Feedback is meant to improve the project, not criticize

## Reporting Issues

### Bug Reports

When reporting a bug, include:

1. **Description**: Clear description of what's broken
2. **Steps to Reproduce**: How to reproduce the issue
3. **Expected Behavior**: What should happen
4. **Actual Behavior**: What actually happens
5. **Environment**: OS, Node.js version, Gyro version
6. **Code Example**: Minimal reproducible example



### Feature Requests

When requesting a feature, include:

1. **Description**: Clear description of the feature
2. **Use Case**: Why this feature would be useful
3. **Examples**: How it might be used
4. **Alternatives**: Any alternative approaches


### Adding New Features

1. **Decide on Syntax**: What will the code look like?
2. **Update Lexer**: Add tokens if needed
3. **Update Parser**: Add parsing logic
4. **Update AST**: Add node types
5. **Add Type Checking**: Implement type validation
6. **Implement Codegen**: Generate bytecode
7. **Handle in VM**: Execute the bytecode
8. **Test and Document**: Write tests and update docs


## Documentation

- Update README.md for user-facing changes
- Update code comments for implementation details
- Add examples for new features
- Update this CONTRIBUTING.md as needed

## Getting Help

- **Issues**: Open a GitHub issue for questions
- **Discussions**: Use GitHub Discussions for ideas
- **Email**: Contact maintainers at nifemibosun70@gmail.com

## Recognition

Contributors will be recognized in:
- CONTRIBUTORS.md file (if we create one)
- Release notes
- README.md (for significant contributions)

## License

By contributing, you agree that your contributions will be licensed under the same MIT License as the project.

---

Thank you for contributing to Gyro!
