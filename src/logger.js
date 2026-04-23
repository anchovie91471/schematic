import chalk from 'chalk';

class Logger {
  constructor(verbose = true) {
    this.verbose = verbose;
    // Respect environment: don't force colors in CI/CD
    this.useColor = !process.env.NO_COLOR && !!process.stdout.isTTY;
  }

  setVerbose(verbose) {
    this.verbose = verbose;
  }

  info(msg) {
    if (this.verbose) {
      const icon = this.useColor ? chalk.blue('ℹ') : 'ℹ';
      const text = this.useColor ? chalk.blue(msg) : msg;
      console.log(icon, text);
    }
  }

  success(msg) {
    if (this.verbose) {
      const icon = this.useColor ? chalk.green('✓') : '✓';
      const text = this.useColor ? chalk.green(msg) : msg;
      console.log(icon, text);
    }
  }

  warn(msg) {
    const icon = this.useColor ? chalk.yellow('⚠') : '⚠';
    const text = this.useColor ? chalk.yellow(msg) : msg;
    console.log(icon, text);
  }

  error(msg) {
    const icon = this.useColor ? chalk.red('✗') : '✗';
    const text = this.useColor ? chalk.red(msg) : msg;
    console.log(icon, text);
  }

  debug(msg) {
    if (this.verbose) {
      const icon = this.useColor ? chalk.gray('🔍') : '🔍';
      const text = this.useColor ? chalk.gray(msg) : msg;
      console.log(icon, text);
    }
  }

  // Structured error reporting
  schemaError(file, error, context = '') {
    this.error('Schema Error');
    console.log('   File:', file);
    if (context) console.log('   Context:', context);
    console.log('   Issue:', error);
    console.log();
  }

  // Scaffold helpers
  fileExists(path) {
    const msg = this.useColor ? chalk.yellow(`File already exists: ${path}`) : `File already exists: ${path}`;
    console.log('⚠', msg);
  }

  fileCreated(type, path) {
    const typeLabel = this.useColor ? chalk.cyan(type) : type;
    const pathLabel = this.useColor ? chalk.gray(path) : path;
    console.log('✓', `Created ${typeLabel}:`, pathLabel);
  }
}

export { Logger };
