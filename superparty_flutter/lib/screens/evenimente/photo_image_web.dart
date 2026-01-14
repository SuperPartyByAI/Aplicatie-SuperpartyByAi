import 'package:flutter/material.dart';

Widget buildDoveziImage(
  String path, {
  BoxFit fit = BoxFit.cover,
}) {
  return Image.network(
    path,
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

