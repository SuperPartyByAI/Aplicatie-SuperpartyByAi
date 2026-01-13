import 'dart:io';

import 'package:flutter/material.dart';

Widget buildDoveziImage(
  String path, {
  BoxFit fit = BoxFit.cover,
}) {
  final p = path.trim();
  final isUrl = p.startsWith('http://') || p.startsWith('https://');
  if (isUrl) {
    return Image.network(
      p,
      fit: fit,
      errorBuilder: (context, error, stackTrace) {
        return const Center(
          child: Icon(
            Icons.broken_image,
            color: Color(0xB3EAF1FF),
            size: 32,
          ),
        );
      },
    );
  }

  return Image.file(
    File(p),
    fit: fit,
    errorBuilder: (context, error, stackTrace) {
      return const Center(
        child: Icon(
          Icons.broken_image,
          color: Color(0xB3EAF1FF),
          size: 32,
        ),
      );
    },
  );
}

