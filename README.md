# actions-apply-version-label

GitHub workflow used by the [React Native](https://github.com/facebook/react-native) repository to automatically add `Version: TAG` to issues tagged with specific labels.

## Inputs

### `github-token`

**Required** The `GITHUB_TOKEN` secret.

### `required-label`

**Required** The required label for this action to run.

## Example

```
- uses: react-native-community/actions-apply-version-label@v0.0.3
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
          required-label: "Type: Upgrade Issue"
```

