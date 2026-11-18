import 'package:material_ui/material_ui.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_svg/flutter_svg.dart';

import '../../data/providers.dart';

/// Settings. Sync credentials are stored in the same SQLite file as the data so
/// a backup is one file, and the connection check reports the exact failure.
class SettingsPage extends ConsumerStatefulWidget {
  const SettingsPage({super.key});

  @override
  ConsumerState<SettingsPage> createState() => _SettingsPageState();
}

class _SettingsPageState extends ConsumerState<SettingsPage> {
  final _baseUrl = TextEditingController();
  final _token = TextEditingController();
  final _password = TextEditingController();

  bool _loaded = false;
  bool _busy = false;
  String? _status;
  bool _statusOk = false;

  @override
  void dispose() {
    _baseUrl.dispose();
    _token.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final repo = ref.read(settingsRepositoryProvider);
    final current = await repo.load();
    await repo.save(
      current.copyWith(
        syncBaseUrl: _baseUrl.text.trim(),
        syncToken: _token.text.trim(),
        syncEncryptionPassword: _password.text,
      ),
    );
    ref.invalidate(settingsProvider);
    if (mounted) {
      setState(() {
        _statusOk = true;
        _status = 'Saved.';
      });
    }
  }

  Future<void> _test() async {
    setState(() {
      _busy = true;
      _status = 'Connecting…';
      _statusOk = false;
    });

    final settings = AppSettings(
      syncBaseUrl: _baseUrl.text.trim(),
      syncToken: _token.text.trim(),
      syncEncryptionPassword: _password.text,
    );

    final result = await ref.read(syncClientProvider).probe(settings);
    if (!mounted) return;
    setState(() {
      _busy = false;
      _statusOk = result.ok;
      _status = result.ok && result.latestSeq != null
          ? '${result.message} Latest operation #${result.latestSeq}.'
          : result.message;
    });
  }

  @override
  Widget build(BuildContext context) {
    final settings = ref.watch(settingsProvider);

    settings.whenData((value) {
      if (_loaded) return;
      _loaded = true;
      _baseUrl.text = value.syncBaseUrl;
      _token.text = value.syncToken;
      _password.text = value.syncEncryptionPassword;
    });

    return Scaffold(
      appBar: AppBar(title: const Text('Settings')),
      body: settings.when(
        loading: () => const Center(child: CircularProgressIndicator(strokeWidth: 2)),
        error: (error, _) => Center(child: Text('$error')),
        data: (_) => ListView(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
          children: [
            const SizedBox(height: 8),
            Row(
              children: [
                SvgPicture.asset('assets/brand/logo-transparent.svg', width: 22, height: 22),
                const SizedBox(width: 10),
                const Text(
                  'superprod',
                  style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700, letterSpacing: -0.3),
                ),
              ],
            ),
            const SizedBox(height: 4),
            const Text(
              'Local-first client for Super Productivity',
              style: TextStyle(fontSize: 12, color: Color(0xFF5C5C5C)),
            ),
            const SizedBox(height: 28),
            const _SectionTitle('SUPERSYNC'),
            const SizedBox(height: 10),
            TextField(
              controller: _baseUrl,
              keyboardType: TextInputType.url,
              autocorrect: false,
              decoration: const InputDecoration(
                labelText: 'Server URL',
                hintText: 'https://sync.example.com',
              ),
            ),
            const SizedBox(height: 10),
            TextField(
              controller: _token,
              obscureText: true,
              autocorrect: false,
              decoration: const InputDecoration(labelText: 'Access token'),
            ),
            const SizedBox(height: 10),
            TextField(
              controller: _password,
              obscureText: true,
              autocorrect: false,
              decoration: const InputDecoration(
                labelText: 'Encryption password',
                helperText: 'Required for end-to-end encrypted accounts',
                helperMaxLines: 2,
              ),
            ),
            const SizedBox(height: 14),
            Row(
              children: [
                Expanded(
                  child: FilledButton(
                    onPressed: _busy ? null : _test,
                    child: Text(_busy ? 'Testing…' : 'Test connection'),
                  ),
                ),
                const SizedBox(width: 10),
                OutlinedButton(onPressed: _busy ? null : _save, child: const Text('Save')),
              ],
            ),
            if (_status != null) ...[
              const SizedBox(height: 12),
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: _statusOk ? const Color(0x1A3094DE) : const Color(0x1AD05C5C),
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(
                    color: _statusOk ? const Color(0xFF3094DE) : const Color(0xFFD05C5C),
                  ),
                ),
                child: Text(
                  _status!,
                  style: TextStyle(
                    fontSize: 12,
                    height: 1.4,
                    color: _statusOk ? const Color(0xFF3094DE) : const Color(0xFFD05C5C),
                  ),
                ),
              ),
            ],
            const SizedBox(height: 28),
            const _SectionTitle('ABOUT'),
            const SizedBox(height: 10),
            const _InfoRow(label: 'Version', value: '0.1.0 (rebuild)'),
            const _InfoRow(label: 'Package', value: 'com.dwprod.superprod'),
            const _InfoRow(label: 'Sync', value: 'Read-only check in this build'),
          ],
        ),
      ),
    );
  }
}

class _SectionTitle extends StatelessWidget {
  const _SectionTitle(this.text);

  final String text;

  @override
  Widget build(BuildContext context) => Text(
        text,
        style: const TextStyle(fontSize: 11, letterSpacing: 1.2, color: Color(0xFF5C5C5C)),
      );
}

class _InfoRow extends StatelessWidget {
  const _InfoRow({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 6),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text(label, style: const TextStyle(fontSize: 13, color: Color(0xFF9A9A9A))),
            Text(value, style: const TextStyle(fontSize: 13)),
          ],
        ),
      );
}
