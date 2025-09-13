/**
 * Safe formula parser that only allows basic math operations and cell references
 * Prevents arbitrary code execution from malicious PDF content
 */

interface CellData {
  value: string;
  formula?: string;
  computed?: number;
}

interface TableData {
  id: string;
  name: string;
  headers: string[];
  rows: CellData[][];
  formulas: { [key: string]: string };
}

class SafeFormulaParser {
  private readonly ALLOWED_OPERATORS = ['+', '-', '*', '/', '(', ')', '.'];
  private readonly MAX_EXPRESSION_LENGTH = 1000;

  /**
   * Safely evaluates a mathematical expression with cell references
   * Only allows: numbers, basic math operators (+,-,*,/), parentheses, and cell references (A1, B2, etc.)
   */
  evaluateFormula(formula: string, tableData: TableData): number {
    if (!formula.startsWith('=')) {
      return 0;
    }

    const expression = formula.substring(1).trim();
    
    // Check expression length to prevent DoS attacks
    if (expression.length > this.MAX_EXPRESSION_LENGTH) {
      console.warn('Formula too long, ignoring:', expression.substring(0, 50) + '...');
      return 0;
    }

    try {
      // First, resolve cell references
      const processedExpression = this.resolveCellReferences(expression, tableData);
      
      // Then safely evaluate the mathematical expression
      return this.safeEvaluate(processedExpression);
    } catch (error) {
      console.warn('Formula evaluation error:', error);
      return 0;
    }
  }

  /**
   * Resolves cell references like A1, B2, etc. to their numeric values
   */
  private resolveCellReferences(expression: string, tableData: TableData): string {
    const cellReferenceRegex = /([A-Z]+)(\d+)/g;
    
    return expression.replace(cellReferenceRegex, (match, col, row) => {
      const colIndex = this.columnToIndex(col);
      const rowIndex = parseInt(row) - 1;
      
      if (rowIndex >= 0 && rowIndex < tableData.rows.length && 
          colIndex >= 0 && colIndex < tableData.rows[rowIndex].length) {
        const cellValue = tableData.rows[rowIndex][colIndex].computed || 0;
        return cellValue.toString();
      }
      return '0';
    });
  }

  /**
   * Converts column letters to index (A=0, B=1, Z=25, AA=26, etc.)
   */
  private columnToIndex(col: string): number {
    let result = 0;
    for (let i = 0; i < col.length; i++) {
      result = result * 26 + (col.charCodeAt(i) - 65 + 1);
    }
    return result - 1;
  }

  /**
   * Safely evaluates a mathematical expression using a tokenizer approach
   * Only allows numbers, basic operators, and parentheses
   */
  private safeEvaluate(expression: string): number {
    // Remove all whitespace
    const cleanExpression = expression.replace(/\s+/g, '');
    
    // Validate that expression only contains allowed characters
    if (!this.isValidExpression(cleanExpression)) {
      throw new Error('Invalid characters in expression');
    }

    // Tokenize and evaluate
    const tokens = this.tokenize(cleanExpression);
    return this.evaluateTokens(tokens);
  }

  /**
   * Validates that expression only contains allowed characters
   */
  private isValidExpression(expression: string): boolean {
    const allowedChars = /^[0-9+\-*/().\s]*$/;
    return allowedChars.test(expression);
  }

  /**
   * Tokenizes the expression into numbers and operators
   */
  private tokenize(expression: string): (number | string)[] {
    const tokens: (number | string)[] = [];
    let currentNumber = '';
    
    for (let i = 0; i < expression.length; i++) {
      const char = expression[i];
      
      if (char >= '0' && char <= '9' || char === '.') {
        currentNumber += char;
      } else if (this.ALLOWED_OPERATORS.includes(char)) {
        if (currentNumber) {
          tokens.push(parseFloat(currentNumber));
          currentNumber = '';
        }
        tokens.push(char);
      } else {
        throw new Error(`Invalid character: ${char}`);
      }
    }
    
    if (currentNumber) {
      tokens.push(parseFloat(currentNumber));
    }
    
    return tokens;
  }

  /**
   * Evaluates tokenized expression using operator precedence
   */
  private evaluateTokens(tokens: (number | string)[]): number {
    // Handle parentheses first
    while (tokens.includes('(')) {
      const openIndex = tokens.lastIndexOf('(');
      const closeIndex = tokens.indexOf(')', openIndex);
      
      if (closeIndex === -1) {
        throw new Error('Mismatched parentheses');
      }
      
      const subExpression = tokens.slice(openIndex + 1, closeIndex);
      const result = this.evaluateTokens(subExpression);
      
      tokens.splice(openIndex, closeIndex - openIndex + 1, result);
    }
    
    // Handle multiplication and division first (left to right)
    for (let i = 1; i < tokens.length; i += 2) {
      if (tokens[i] === '*' || tokens[i] === '/') {
        const left = tokens[i - 1] as number;
        const operator = tokens[i] as string;
        const right = tokens[i + 1] as number;
        
        const result = operator === '*' ? left * right : left / right;
        tokens.splice(i - 1, 3, result);
        i -= 2; // Adjust index after splice
      }
    }
    
    // Handle addition and subtraction (left to right)
    for (let i = 1; i < tokens.length; i += 2) {
      if (tokens[i] === '+' || tokens[i] === '-') {
        const left = tokens[i - 1] as number;
        const operator = tokens[i] as string;
        const right = tokens[i + 1] as number;
        
        const result = operator === '+' ? left + right : left - right;
        tokens.splice(i - 1, 3, result);
        i -= 2; // Adjust index after splice
      }
    }
    
    if (tokens.length !== 1 || typeof tokens[0] !== 'number') {
      throw new Error('Invalid expression result');
    }
    
    return tokens[0];
  }
}

// Export singleton instance
export const safeFormulaParser = new SafeFormulaParser();