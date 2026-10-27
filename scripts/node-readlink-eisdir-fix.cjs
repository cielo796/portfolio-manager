const fs = require('fs');

const originalReadlink = fs.readlink;
const originalReadlinkSync = fs.readlinkSync;
const originalPromisesReadlink = fs.promises?.readlink?.bind(fs.promises);

const toInvalidArgumentError = (error, targetPath) => {
  const nextError = new Error(error.message.replace(/^EISDIR/, 'EINVAL'));
  nextError.code = 'EINVAL';
  nextError.errno = error.errno;
  nextError.path = error.path || targetPath;
  nextError.syscall = error.syscall || 'readlink';
  return nextError;
};

const shouldNormalizeReadlinkError = (error, targetPath) => {
  if (!error || error.code !== 'EISDIR') return false;

  try {
    return !fs.lstatSync(targetPath).isSymbolicLink();
  } catch {
    return false;
  }
};

fs.readlink = function readlink(targetPath, options, callback) {
  const hasOptions = typeof options !== 'function';
  const done = hasOptions ? callback : options;

  if (typeof done !== 'function') {
    return hasOptions
      ? originalReadlink.call(fs, targetPath, options)
      : originalReadlink.call(fs, targetPath);
  }

  const wrappedCallback = (error, result) => {
    done(
      shouldNormalizeReadlinkError(error, targetPath)
        ? toInvalidArgumentError(error, targetPath)
        : error,
      result,
    );
  };

  return hasOptions
    ? originalReadlink.call(fs, targetPath, options, wrappedCallback)
    : originalReadlink.call(fs, targetPath, wrappedCallback);
};

fs.readlinkSync = function readlinkSync(targetPath, options) {
  try {
    return originalReadlinkSync.call(fs, targetPath, options);
  } catch (error) {
    if (shouldNormalizeReadlinkError(error, targetPath)) {
      throw toInvalidArgumentError(error, targetPath);
    }

    throw error;
  }
};

if (fs.promises && originalPromisesReadlink) {
  fs.promises.readlink = async function readlink(targetPath, options) {
    try {
      return await originalPromisesReadlink(targetPath, options);
    } catch (error) {
      if (shouldNormalizeReadlinkError(error, targetPath)) {
        throw toInvalidArgumentError(error, targetPath);
      }

      throw error;
    }
  };
}
