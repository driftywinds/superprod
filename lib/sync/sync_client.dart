import 'package:dio/dio.dart';

import '../data/providers.dart';

/// Result of a connection check against a SuperSync server.
///
/// Deliberately explicit: "could not reach the server" was the single most
/// confusing failure in the previous client, so every branch is named.
class SyncProbeResult {
  const SyncProbeResult({
    required this.ok,
    required this.message,
    this.latestSeq,
    this.usedMb,
    this.quotaMb,
  });

  final bool ok;
  final String message;
  final int? latestSeq;
  final double? usedMb;
  final double? quotaMb;
}

/// Minimal SuperSync client: status probe for now, with the transport shape the
/// sync engine will reuse (bearer token, JSON, `/api` prefix).
class SyncClient {
  SyncClient({Dio? dio})
      : _dio = dio ??
            Dio(
              BaseOptions(
                connectTimeout: const Duration(seconds: 15),
                receiveTimeout: const Duration(seconds: 20),
                headers: {'Accept': 'application/json'},
                validateStatus: (_) => true,
              ),
            );

  final Dio _dio;

  Future<SyncProbeResult> probe(AppSettings settings) async {
    final baseUrl = settings.syncBaseUrl.trim().replaceAll(RegExp(r'/+$'), '');
    if (baseUrl.isEmpty) {
      return const SyncProbeResult(ok: false, message: 'Enter a server URL first.');
    }
    if (settings.syncToken.trim().isEmpty) {
      return const SyncProbeResult(ok: false, message: 'Enter an access token first.');
    }

    try {
      final response = await _dio.get<Map<String, dynamic>>(
        '$baseUrl/api/sync/status',
        options: Options(headers: {'Authorization': 'Bearer ${settings.syncToken.trim()}'}),
      );

      final status = response.statusCode ?? 0;
      final body = response.data ?? const <String, dynamic>{};

      if (status == 401 || status == 403) {
        return const SyncProbeResult(
          ok: false,
          message: 'The server rejected this token (HTTP 401). Sign in again to get a new one.',
        );
      }
      if (status != 200) {
        final error = body['error'] as String?;
        return SyncProbeResult(
          ok: false,
          message: error == null
              ? 'Server answered HTTP $status.'
              : 'Server answered HTTP $status: $error',
        );
      }

      final quota = (body['storageQuotaBytes'] as num?)?.toDouble() ?? 0;
      final used = (body['storageUsedBytes'] as num?)?.toDouble() ?? 0;

      return SyncProbeResult(
        ok: true,
        message: 'Connected. ${_mb(used)} of ${_mb(quota)} used.',
        latestSeq: (body['latestSeq'] as num?)?.toInt(),
        usedMb: used / (1024 * 1024),
        quotaMb: quota / (1024 * 1024),
      );
    } on DioException catch (error) {
      final kind = error.type;
      final message = switch (kind) {
        DioExceptionType.connectionTimeout ||
        DioExceptionType.sendTimeout ||
        DioExceptionType.receiveTimeout =>
          'The server did not answer in time. Check the URL and your connection.',
        DioExceptionType.badCertificate =>
          'The server certificate could not be verified.',
        DioExceptionType.connectionError =>
          'Could not reach the server. Check the URL and that the server is running.',
        _ => 'Network error: ${error.message ?? kind.name}',
      };
      return SyncProbeResult(ok: false, message: message);
    }
  }

  static String _mb(double bytes) {
    final mb = bytes / (1024 * 1024);
    return mb >= 10 ? '${mb.toStringAsFixed(0)} MB' : '${mb.toStringAsFixed(2)} MB';
  }
}
